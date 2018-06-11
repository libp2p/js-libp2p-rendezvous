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

module.exports = RendezvousDiscovery
