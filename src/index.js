'use strict'

const RPC = require('./rpc')
const noop = () => {}

class RendezvousDiscovery {
  constructor (swarm) {
    this.swarm = swarm
    this.peers = []
  }

  _dial (pi, cb) {
    if (!cb) cb = noop
    this.swarm.dialProtocol(pi, '/rendezvous/1.0.0', (err, conn) => {
      if (err) return cb(err)
      const rpc = new RPC()
      rpc.setup(conn, err => {
        if (err) return cb(err)
        this.peers.push(rpc)
        cb()
      })
    })
  }

  _rpc (cmd, ...a) { // TODO: add. round-robin / multicast / anycast?
    this.peers[0][cmd](...a)
  }

  register (ns, peer, cb) {
    this._rpc('register', ns, peer, 0, cb) // TODO: interface does not expose ttl option?!
  }

  discover (ns, limit, cookie, cb) {
    if (typeof cookie === 'function') {
      cb = cookie
      cookie = Buffer.from('')
    }
    if (typeof limit === 'function') {
      cookie = Buffer.from('')
      cb = limit
      limit = 0
    }
    if (typeof ns === 'function') {
      cookie = Buffer.from('')
      limit = 0
      cb = ns
      ns = null
    }

    this._rpc('discover', ns, limit, cookie, cb)
  }

  unregister (ns, id) {
    if (!ns) {
      id = this.swarm.peerInfo.id.toBytes()
      ns = null
    }
    if (!id) {
      id = this.swarm.peerInfo.id.toBytes()
    }

    this._rpc('unregister', ns, id)
  }

  start (cb) {
    this.swarm.on('peer:connect', peer => {
      this._dial(peer)
    })
    cb()
  }

  stop (cb) {
    // TODO: shutdown all conns
    cb()
  }
}

module.exports = RendezvousDiscovery
