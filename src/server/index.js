'use strict'

const debug = require('debug')
const log = debug('libp2p:rendezvous:server')
const pull = require('pull-stream')

const ImmutableStore = require('./store/immutable')
const RPC = require('./rpc')

class Server {
  constructor (opt) {
    if (!opt) opt = {}
    this.swarm = opt.swarm
    this.Store = opt.store || ImmutableStore
    this.store = this.Store.createStore(opt.storeConfig || {})
    this.gcTime = opt.gcIntv || 60 * 1000
  }

  start () {
    this.gcIntv = setInterval(this.gc.bind(this), this.gcTime)
    this.swarm.handle('/p2p/rendezvous/1.0.0', (proto, conn) => {
      conn.getPeerInfo((err, pi) => {
        if (err) return log(err)

        log('rpc from %s', pi.id.toB58String())

        pull(
          conn,
          RPC(pi, this),
          conn
        )
      })
    })
  }

  stop () {
    clearInterval(this.gcIntv)
    // TODO: clear vars, shutdown conns, etc.
    this.swarm.unhandle('/p2p/rendezvous/1.0.0')
  }

  gc () {
    this.store = this.Store.clearEmptyNamespaces(this.Store.clearExpired(this.store))
  }
}

module.exports = Server
