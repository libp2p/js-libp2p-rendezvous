'use strict'

// const {waterfall} = require('async')
const RPC = require('./rpc')
const debug = require('debug')
const log = debug('libp2p:rendezvous:server')
const AsyncQueue = require('./queue')
const BasicStore = require('./store/basic')

class Server {
  constructor (opt) {
    if (!opt) opt = {}
    this.node = opt.node
    this.config = opt.config
    this.que = new AsyncQueue()
    this.table = {
      NS: {},
      RPC: {}
    }
    const Store = opt.store || BasicStore
    this.store = new Store(this)
    this._stubNS = this.store.create(Buffer.alloc(256, '0').toString())
  }

  start () {
    this.gcIntv = setInterval(this.gc.bind(this), 60 * 1000)
    this.node.handle('/rendezvous/1.0.0', (proto, conn) => {
      const rpc = new RPC(this)
      rpc.setup(conn, err => {
        if (err) return log(err)
        this.storeRPC(rpc)
      })
    })
  }

  stop () {
    clearInterval(this.gcIntv)
    // TODO: clear vars, shutdown conns, etc.
    this.node.unhandle('/rendezvous/1.0.0')
  }

  storeRPC (rpc) {
    // TODO: should a peer that's connected twice be overriden or rejected?
    this.table.RPC[rpc.id] = rpc
    // TODO: remove on disconnect
  }

  getNS (name, create) {
    if (!this.table.NS[name]) {
      if (create) {
        return (this.table.NS[name] = this.store.create(name))
      } else {
        return this._stubNS
      }
    }
    return this.table.NS[name]
  }

  gc () {
    Object.keys(this.table.NS).forEach(ns => {
      const n = this.table.NS[ns]
      const removed = n.gc()
      if (n.useless) {
        log('drop NS %s because it is empty', n.name)
        delete this.table.NS[ns]
      } else {
        if (removed) n.update()
      }
    })
  }
}

module.exports = Server
