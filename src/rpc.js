'use strict'

const pull = require('pull-stream')
const ppb = require('pull-protocol-buffers')
const {Message, MessageType} = require('./proto')
const Pushable = require('pull-pushable')
const debug = require('debug')
const log = debug('libp2p-rendezvous:rpc')
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

class RPC {
  constructor () {
    this.source = Pushable()
    this.cbs = {
      discover: [],
      register: []
    }
  }
  sink (read) {
    const next = (end, msg, doend) => {
      if (doend) {
        log('crash@%s: %s', this.id, doend)
        return read(doend, next)
      }
      if (end) {
        this.online = false
        log('end@%s: %s', this.id, end)
        this.source.end()
        return
      }
      let f
      let pi
      switch (msg.type) {
        case MessageType.REGISTER_RESPONSE:
          f = this.cbs.register.shift()
          if (typeof f !== 'function') {
            log('register@%s: response ignored, no cb found!', this.id)
            return read(null, next)
          } else {
            let e
            if (msg.registerResponse.status) {
              e = new Error('Server returned error: ' + (msg.registerResponse.statusText || '(unknown code)'))
            }
            f(e)
          }
          break
        case MessageType.DISCOVER_RESPONSE:
          try {
            f = this.cbs.discover.shift()
            if (typeof f !== 'function') {
              log('discover@%s: response ignored, no cb found!', this.id)
              return read(null, next)
            } else {
              if (msg.discoverResponse.status) {
                return setImmediate(() => f(new Error('Server returned error: ' + (msg.discoverResponse.statusText || '(unknown code)'))))
              }
              pi = msg.discoverResponse.registrations.map(p => {
                try {
                  // TODO: use other values like ttl/ns in peer-info?
                  const pi = new Peer(new Id(p.peer.id))
                  p.peer.addrs.forEach(a => pi.multiaddrs.add(a))
                  return pi
                } catch (e) {
                  log('discover@%s: invalid pi returned: %s', this.id, e)
                }
              }).filter(Boolean)
              setImmediate(() => f(null, {
                cookie: msg.discoverResponse.cookie,
                peers: pi
              }))
            }
          } catch (e) {
            f(e)
            return next(null, null, e)
          }
          break
        default: // should that disconnect or just get ignored?
          log('error@%s: sent wrong msg type %s', this.id, msg.type)
          return next(null, null, true)
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

      this.online = true
      cb()
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

  discover (ns, limit, cookie, cb) {
    this.source.push({
      type: MessageType.DISCOVER,
      discover: {
        ns,
        limit,
        cookie
      }
    })
    this.cbs.discover.push(wrap(cb, TIMEOUT))
  }

  unregister (ns, id) {
    this.source.push({
      type: MessageType.UNREGISTER,
      unregister: {
        ns,
        id
      }
    })
  }
}

module.exports = RPC
