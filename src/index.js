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
      const rpc = new RPC()
      rpc.setup(conn, err => {
        if (err) return cb(err)
        this.peers.push(rpc)
      })
    })
  }

  _rpc (cmd, ...a) { // TODO: add. round-robin / multicast / anycast?

  }

  register (ns, peer, cb) {
    this._rpc('register', ns, peer, 0, cb) // TODO: interface does not expose ttl option?!
  }

  discover (ns, limit, since, cb) {
    if (typeof since === 'function') {
      cb = since
      since = 0
    }
    if (typeof limit === 'function') {
      since = 0
      cb = limit
      limit = 0
    }
    if (typeof ns === 'function') {
      since = 0
      limit = 0
      cb = ns
      ns = null
    }

    this._rpc('discover', ns, limit, since, cb)
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
