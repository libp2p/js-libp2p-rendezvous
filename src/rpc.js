'use strict'

const pull = require('pull-stream')
const ppb = require('pull-protocol-buffers')
const {Message, MessageType} = require('../proto')
const Pushable = require('pull-pushable')
const debug = require('debug')
const log = debug('libp2p-rendezvous:rpc')
const Peer = require('peer-info')
const Id = require('peer-id')

class RPC {
  constructor () {
    this.source = Pushable()
    this.cbs = {
      discover: []
    }
  }
  sink (read) {
    const next = (end, msg) => {
      if (end) {
        log('end: %s %s', this.id, end)
        this.source.end()
        return read(true, next)
      }
      switch (msg.type) {
        case MessageType.REGISTER_RESPONSE: // TODO: spec in progress
          break
        case MessageType.DISCOVER_RESPONSE:
          let f
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
}

module.exports = RPC
