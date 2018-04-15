'use strict'

const pull = require('pull-stream')
const ppb = require('pull-protocol-buffers')
const {Message, MessageType, RegisterStatus} = require('../proto')
const Pushable = require('pull-pushable')
const debug = require('debug')
const log = debug('libp2p-rendezvous:server:rpc')
const Peer = require('peer-info')
const Id = require('peer-id')

const MAX_NS_LENGTH = 255 // TODO: spec this

class RPC {
  constructor (main) {
    this.main = main
    this.source = Pushable()
  }
  sink (read) {
    const next = (end, msg) => {
      if (end) {
        log('end: %s %s', this.id, end)
        this.source.end()
        return read(true, next)
      }
      switch (msg.type) {
        case MessageType.REGISTER:
          try {
            if (msg.register.peer.id && new Id(msg.register.peer.id).toB58String() !== this.id) {
              this.source.push({
                type: MessageType.REGISTER_RESPONSE,
                registerResponse: {
                  code: RegisterStatus.E_NOT_AUTHORIZED
                }
              })
              return read(null, next)
            } else if (!msg.register.peer.id) {
              msg.register.peer.id = this.pi.id.toBytes()
            }
            if (msg.register.ns > MAX_NS_LENGTH) {
              this.source.push({
                type: MessageType.REGISTER_RESPONSE,
                registerResponse: {
                  code: RegisterStatus.E_INVALID_NAMESPACE
                }
              })
              return read(null, next)
            }
            const pi = new Peer(new Id(msg.register.peer.id))
            msg.register.peer.addrs.forEach(a => pi.multiaddr.add(a))
            this.main.getNS(msg.register.ns).addPeer(pi, Date.now(), msg.register.ttl)
            this.source.push({
              type: MessageType.REGISTER_RESPONSE,
              registerResponse: {
                code: RegisterStatus.OK
              }
            })
          } catch (e) { // TODO: Add E_INVALID_PEER_INFO
            return next(e)
          }
          break
        case MessageType.UNREGISTER:
          try {
            // TODO: currently ignores id since there is no ownership error. change?
            this.main.getNS(msg.unregister.ns).removePeer(this.id)
          } catch (e) {
            return next(e)
          }
          break
        case MessageType.DISCOVER:
          try {
            const peers = this.main.getNS(msg.discover.ns, false).getPeers(msg.discover.since || 0, msg.discover.limit, this.id) // TODO: add a max-limit to avoid dos?
            this.source.push({
              type: MessageType.DISCOVER_RESPONSE,
              discoverResponse: {
                registrations: peers.map(p => {
                  return {
                    ns: msg.discover.ns,
                    peer: {
                      id: p.pi.id.toBytes(),
                      addrs: p.pi.multiaddrs.toArray().map(a => a.buffer)
                    },
                    ttl: p.ttl
                  }
                }),
                timestamp: peers.pop().ts
              }
            })
          } catch (e) {
            return next(e)
          }
          break
//      case MessageType.REGISTER_RESPONSE:
//      case MessageType.DISCOVER_RESPONSE:
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
