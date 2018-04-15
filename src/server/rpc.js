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
    const next = (end, msg, doend) => {
      if (doend) {
        return read(doend, next)
      }
      if (end) {
        log('end@%s: %s', this.id, end)
        this.source.end()
        return
      }
      switch (msg.type) {
        case MessageType.REGISTER:
          try {
            log('register@%s: trying register on %s', this.id, msg.register.ns)
            if (msg.register.peer.id && new Id(msg.register.peer.id).toB58String() !== this.id) {
              log('register@%s: auth err (want %s)', this.id, new Id(msg.register.peer.id).toB58String())
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
              log('register@%s: ns err', this.id)
              this.source.push({
                type: MessageType.REGISTER_RESPONSE,
                registerResponse: {
                  code: RegisterStatus.E_INVALID_NAMESPACE
                }
              })
              return read(null, next)
            }
            const pi = new Peer(new Id(msg.register.peer.id))
            msg.register.peer.addrs.forEach(a => pi.multiaddrs.add(a))
            this.main.getNS(msg.register.ns, true).addPeer(pi, Date.now(), msg.register.ttl)
            log('register@%s: ok', this.id)
            this.source.push({
              type: MessageType.REGISTER_RESPONSE,
              registerResponse: {
                code: RegisterStatus.OK
              }
            })
          } catch (e) { // TODO: this might also throw on non-peer-info errors
            log('register@%s: other (possibly peer-info related) error', this.id)
            log(e) // let's debug the above statement
            this.source.push({
              type: MessageType.REGISTER_RESPONSE,
              registerResponse: {
                code: RegisterStatus.E_INVALID_PEER_INFO
              }
            })
            return read(null, next)
          }
          break
        case MessageType.UNREGISTER:
          try {
            log('unregister@%s: unregister from %s', this.id, msg.unregister.ns)
            // TODO: currently ignores id since there is no ownership error. change?
            this.main.getNS(msg.unregister.ns).removePeer(this.id)
          } catch (e) {
            return next(null, null, e)
          }
          break
        case MessageType.DISCOVER:
          try {
            log('discover@%s: discover on %s', this.id, msg.discover.ns)
            const peers = this.main.getNS(msg.discover.ns).getPeers(msg.discover.since || 0, msg.discover.limit, this.id) // TODO: add a max-limit to avoid dos?
            log('discover@%s: got %s peers', this.id, peers.length)
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
                timestamp: peers.length ? peers.pop().ts : null
              }
            })
          } catch (e) {
            return next(null, null, e)
          }
          break
//      case MessageType.REGISTER_RESPONSE:
//      case MessageType.DISCOVER_RESPONSE:
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

      cb()
    })
  }
}

module.exports = RPC
