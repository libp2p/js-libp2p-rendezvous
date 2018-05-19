'use strict'

const RPC = require('./rpc')
const noop = () => {}
const State = require('./state')

class RendezvousDiscovery {
  constructor (swarm) {
    this.swarm = swarm
    this.rpc = []
    this.rpcById = {}
    this.state = new State(this)
    this.swarm.on('peer:connect', peer => {
      this._dial(peer)
    })
  }

  _dial (pi, cb) {
    if (!cb) cb = noop
    if (!this.state) return cb()
    this.swarm.dialProtocol(pi, '/rendezvous/1.0.0', (err, conn) => {
      if (err) return cb(err)
      const rpc = new RPC()
      rpc.setup(conn, err => {
        if (err) return cb(err)
        this.state.manage(rpc)
        this.state.syncState(cb)
      })
    })
  }

  register (ns, peer, ttl, cb) {
    if (typeof ttl === 'function') {
      cb = ttl
      ttl = 0
    }
    if (typeof peer === 'function') {
      ttl = 0
      cb = peer
      peer = this.swarm.peerInfo
    }

    this.state.register(ns, peer, ttl, cb)
  }

  discover (ns, limit, /* cookie, */ cb) {
    /* if (typeof cookie === 'function') {
      cb = cookie
      cookie = Buffer.from('')
    } */
    if (typeof limit === 'function') {
//      cookie = Buffer.from('')
      cb = limit
      limit = 0
    }
    if (typeof ns === 'function') {
//      cookie = Buffer.from('')
      limit = 0
      cb = ns
      ns = null
    }

    this.state.discover(ns, limit, cb)
  }

  unregister (ns, id) {
    if (!ns) {
      id = this.swarm.peerInfo.id.toBytes()
      ns = null
    }
    if (!id) {
      id = this.swarm.peerInfo.id.toBytes()
    }

    this.state.unregister(ns, id)
  }

  start (cb) {
    this.state = new State(this)
    cb()
  }

  stop (cb) {
    this.state.shutdown(err => {
      if (err) return cb(err)
      this.state = null
      cb()
    })
  }
}

module.exports = RendezvousDiscovery
