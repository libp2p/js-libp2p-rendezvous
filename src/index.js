'use strict'

const RPC = require('./rpc')
const noop = () => {}
const once = require('once')
const debug = require('debug')
const log = debug('libp2p:rendezvous')
const State = require('./state')
const {each, map} = require('async')


// One interface that:
//
// RenderzvousClient
// RenderzvousPoint

class RendezvousDiscovery {
  constructor (swarm) {
    this.swarm = swarm
    this.rpc = []
    this.rpcById = {}
    this.rpcRace = {}
    this.swarm.on('peer:connect', peer => {
      this._dial(peer)
    })
  }

  _getState (id) {
    id = id.toString('hex')
    if (!this.state[id]) return (this.state[id] = new State(this, id))
    return this.state[id]
  }

  _dial (pi, cb) {
    if (!cb) cb = noop
    cb = once(cb)
    if (!this.state) return cb()
    this._cleanPeers()
    if (this.rpcById[pi.id.toB58String()] || this.rpcRace[pi.id.toB58String()]) {
      log('skip reconnecting %s', pi.id.toB58String())
      return cb()
    }
    this.rpcRace[pi.id.toB58String()] = true
    this.swarm.dialProtocol(pi, '/rendezvous/1.0.0', (err, conn) => {
      if (err) return cb(err)
      const rpc = new RPC()
      rpc.setup(conn, err => {
        if (err) return cb(err)

        this.rpc.push(rpc)
        this.rpcById[rpc.id] = rpc

        rpc.cursors = {}
        rpc.registrations = {}

        log('add new peer %s', rpc.id)
        delete this.rpcRace[pi.id.toB58String()]
        this._syncAll(cb)
      })
    })
  }

  _cleanPeers () {
    this.rpc = this.rpc.filter(peer => {
      if (peer.online) return true
      log('drop disconnected peer %s', peer.id)
      delete this.rpcById[peer.id]
      return false
    })
  }

  _syncAll (cb) {
    each(Object.keys(this.state), (s, cb) => this.state[s].syncState(cb), cb)
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

    this._getState(peer.id.toBytes()).register(ns, peer, ttl, cb)
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

    this._cleanPeers()
  }

  unregister (ns, id) {
    if (!ns) {
      id = this.swarm.peerInfo.id.toBytes()
      ns = null
    }
    if (!id) {
      id = this.swarm.peerInfo.id.toBytes()
    }

    this._getState(id).unregister(ns)
  }

  start (cb) {
    this.state = {}
    cb()
  }

  stop (cb) {
    this.rpc.filter(rpc => rpc.online).forEach(rpc => rpc.end())
    this.state = null
    this.rpc = []
    this.rpcById = {}
    this.rpcRace = {}
    cb()
  }
}

module.exports = RendezvousDiscovery
