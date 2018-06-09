'use strict'

const Sync = require('./sync')
const RPC = require('./rpc')
const pull = require('pull-stream')

const debug = require('debug')
const log = debug('libp2p:rendezvous:client')

class Client {
  constructor (swarm) {
    this.swarm = swarm
    this.store = Sync.create()
    this._dialLock = {}
    this._failedCache = {}
  }

  dial (peer) {
    const id = peer.id.toB58String()
    if (this._failedCache[id]) return log('not dialing %s because dial previously failed', id)
    if (this._dialLock[id]) return log('not dialing %s because dial is already in progress', id)
    if (Sync.getPoint(this.store, id)) return log('not dialing %s because peer is already connected', id)
    this._dialLock[id] = true // prevent race
    log('dialing %s', id)

    const cb = (err) => {
      delete this._dialLock[id]

      if (err) {
        log('dialing %s failed: %s', err)
        this._failedCache[id] = true
        return
      }

      log('dialing %s succeeded')
    }

    this.swarm.dialProtocol(peer, '/p2p/rendezvous/1.0.0', (err, conn) => {
      if (err) return cb(err)

      conn.getPeerInfo((err, pi) => {
        if (err) return cb(err)

        let rpc = RPC(pi, this)

        pull(
          conn,
          rpc,
          conn
        )

        this.store = Sync.addPoint(this.store, id, rpc.rpc)
      })
    })
  }
}

module.exports = Client
