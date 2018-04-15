'use strict'

const pull = require('pull-stream')
const ppb = require('pull-protocol-buffers')
const {Message, MessageType} = require('../proto')
const Pushable = require('pull-pushable')
const debug = require('debug')
const log = debug('libp2p-rendezvous:rpc')
const Peer = require('peer-info')
const Id = require('peer-id')
const once = require('once')

const TIMEOUT = 1000 * 10 // TODO: spec this

const registerErrors = {
  100: 'Invalid namespace provided',
  101: 'Invalid peer-info provided',
  200: 'Not authorized'
}

function wrap (f, t) {
  let cb = once((...a) => {
    clearTimeout(timeout)
    f(...a)
  })
  let timeout
  timeout = setTimeout(() => cb(new Error('Timeout!')), t)
  return cb
}

class RPC {
  constructor () {
    this.source = Pushable()
    this.cbs = {
      discover: [],
      register: []
    }
  }
  sink (read) {
    const next = (end, msg) => {
      if (end) {
        log('end: %s %s', this.id, end)
        this.source.end()
        return read(true, next)
      }
      let f
      switch (msg.type) {
        case MessageType.REGISTER_RESPONSE:
          f = this.cbs.register.shift()
          if (typeof f !== 'function') {
            log('register response ignored, no cb found!')
            return read(null, next)
          } else {
            let e
            if (msg.registerResponse.code) {
              e = new Error('Server returned error: ' + (registerErrors[msg.registerResponse.code] || '(unknown code)'))
            }
            f(e)
          }
          break
        case MessageType.DISCOVER_RESPONSE:
          let pi
          try {
            f = this.cbs.discover.shift()
            if (typeof f !== 'function') {
              log('discover response ignored, no cb found!')
              return read(null, next)
            } else {
              pi = msg.discoverResponse.registrations.map(p => {
                try {
                  // TODO: use other values like ttl/ns in peer-info?
                  const pi = new Peer(new Id(p.peer.id))
                  p.peer.addrs.forEach(a => pi.multiaddr.add(a))
                  return pi
                } catch (e) {
                  log('invalid pi returned: %s', e)
                  return
                }
              }).filter(Boolean)
            }
          } catch (e) {
            f(e)
            return next(e)
          }
          f(null, {
            timestamp: msg.discoverResponse.timestamp,
            peers: pi
          })
          break
        default: // should that disconnect or just get ignored?
          log('peer %s sent wrong msg type %s', this.id, msg.type)
          return next(true)
      }
      read(null, next)
    }
    read(null, next)
  }
  setup (conn, cb) {
    conn.getPeerInfo((err, pi) => {
      if (err) return cb(err)
      this.pi = pi
      this.id = pi.id.toB58String()
      pull(
        conn,
        ppb.decode(Message),
        this,
        ppb.encode(Message),
        conn
      )
    })
  }

  register (ns, peer, ttl, cb) {
    this.source.push({
      type: MessageType.REGISTER,
      register: {
        ns,
        peer: {
          id: peer.id.toBytes(),
          addrs: peer.multiaddrs.toArray().map(a => a.buffer)
        },
        ttl
      }
    })
    this.cbs.register.push(wrap(cb, TIMEOUT))
  }

  discover (ns, limit, since, cb) {
    this.source.push({
      type: MessageType.DISCOVER,
      discover: {
        ns,
        limit,
        since
      }
    })
    this.cbs.discover.push(wrap(cb, TIMEOUT))
  }
}

module.exports = RPC
