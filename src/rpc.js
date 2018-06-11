'use strict'

const pull = require('pull-stream')
const ppb = require('pull-protocol-buffers')
const {Message, MessageType} = require('./proto')
const Pushable = require('pull-pushable')
const debug = require('debug')
const log = debug('libp2p:rendezvous:rpc')
const Peer = require('peer-info')
const Id = require('peer-id')
const once = require('once')

const TIMEOUT = 1000 * 10 // TODO: spec this

function wrap (f, t) {
  let cb = once((...a) => {
    clearTimeout(timeout)
    f(...a)
  })
  let timeout
  timeout = setTimeout(() => cb(new Error('Timeout!')), t)
  return cb
}

function sendRequest (input, type, data) {
  input.push({
    type: MessageType[type.toUpperCase()],
    [type.toLowerCase()]: data
  })
}

const rpcCommands = {
  register: (input, cbs, ns, peer, ttl, cb) => {
    sendRequest(input, 'register', {
      ns,
      peer: {
        id: peer.id.toBytes(),
        addrs: peer.multiaddrs.toArray().map(a => a.buffer)
      },
      ttl
    })

    cbs.push(wrap(cb, TIMEOUT))
  },
  discover: (input, cbs, ns, limit, cookie, cb) => {
    sendRequest(input, 'discover', {
      ns,
      limit,
      cookie
    })

    cbs.push(wrap(cb, TIMEOUT))
  },
  unregister: (input, cbs, ns, id, cb) => {
    sendRequest(input, 'unregister', {
      ns,
      id
    })

    if (typeof cb === 'function') { // simulate cb
      setImmediate(() => cb())
    }
  }
}

const handlers = {
  [MessageType.REGISTER_RESPONSE]: (msg) => {
    let res = []
    const {status, statusText} = msg.registerResponse
    if (status) {
      res.push(new Error('Server returned error: ' + (statusText || '(unknown error)')))
    }
    return res
  },
  [MessageType.DISCOVER_RESPONSE]: (msg) => {
    let res = []
    const {cookie, status, statusText, registrations} = msg.discoverResponse

    if (status) {
      res.push(new Error('Server returned error: ' + (statusText || '(unknown error)')))
    } else {
      res.push(null)

      let peers = registrations.map(p => {
        try {
          const pi = new Peer(new Id(p.peer.id))
          p.peer.addrs.forEach(a => pi.multiaddrs.add(a))
          return pi
        } catch (e) {
          log('discover: invalid pi ignored: %s', e)
        }
      }).filter(Boolean)

      res.push({
        cookie,
        peers
      })
    }

    return res
  }
}

const RPC = () => {
  const input = Pushable()
  let cbs = []

  const methods = {}
  for (const p in rpcCommands) {
    methods[p] = (...a) => {
      if (!online) {
        let f = a.pop()
        if (typeof f === 'function') {
          f(new Error('Offline!'))
        }
        return
      }
      rpcCommands[p](input, cbs, ...a)
    }
  }

  let online = true
  methods.online = () => online

  return {
    source: pull(
      input,
      ppb.encode(Message)
    ),
    sink: pull(
      ppb.decode(Message),
      pull.drain(data => {
        let cb = cbs.shift()
        if (!cb) return log('ignore rpc, no cb')
        let handler = handlers[data.type]
        if (handler) {
          cb(...handler(data))
        } else {
          log('no response handler for %s', data.type)
        }
      }, () => (online = false))
    ),
    rpc: () => methods
  }
}

module.exports = RPC
