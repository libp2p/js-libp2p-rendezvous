'use strict'

const debug = require('debug')
const log = debug('libp2p:rendezvous')
const noop = () => {}

const Client = require('./client')
const EE = require('events').EventEmitter

class RendezvousDiscovery extends EE {
  constructor (swarm, opt) {
    super()
    this._client = new Client(swarm, opt)
    this.swarm = swarm
    this.tag = 'rendezvous'
  }
  start () {
    this.swarm.on('peer:connect', (peer) => this._client.dial(peer))
  }
  stop () {
    this._client.stop()
  }
  // TODO: https://github.com/libp2p/specs/issues/47
  register (ns) {
    this._client.register(ns || null, noop)
  }
  unregister (ns) {
    this._client.unregister(ns || null, noop)
  }
}

const RPC = require('./rpc')
const once = require('once')
const {each} = require('async')

// One interface that:
//
// RenderzvousClient
// RenderzvousPoint

class RendezvousDiscovery_ {
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

        rpc.cookies = {}
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

  discover (ns, limit, cb) {
    if (typeof limit === 'function') {
      cb = limit
      limit = 0
    }
    if (typeof ns === 'function') {
      limit = 0
      cb = ns
      ns = null
    }

    this._cleanPeers()

    let peers = this.rpc.slice(0)

    function getMore (cb) {
      let peer = peers.shift()
      if (!peer) return cb(new Error('No more peers left to query!'))
      let cookie = peer.cookies[ns]
      peer.discover(ns, limit, cookie, (err, res) => {
        if (err) return cb(err)
        peer.cookies[ns] = res.cookie
        return cb(null, res.peers)
      })
    }

    let has = []

    function get () {
      if ((limit && has.length < limit) || !peers.length) {
        return cb(null, has)
      }

      getMore((err, peers) => {
        if (err) log('discover:%s: %s', ns, err)
        if (peers && peers.length) has = has.concat(peers)
        get()
      })
    }

    get()
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
