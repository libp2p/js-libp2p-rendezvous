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
    this._discover = {}
    this.swarm = swarm
    this.tag = 'rendezvous'
  }
  start (cb) {
    log('start')
    this._loop = setInterval(this._discoverLoop.bind(this), 10 * 1000)
    this.swarm.on('peer:connect', (peer) => this._client.dial(peer))
    if (cb) {
      cb()
    }
  }
  stop (cb) {
    log('stop')
    clearInterval(this._loop)
    this._client.stop()
    if (cb) {
      cb()
    }
  }
  // TODO: https://github.com/libp2p/specs/issues/47
  register (ns) {
    if (!ns) {
      ns = null // need cannonical form of "empty"
    }
    log('register', ns)
    this._discover[ns] = true
    this._client.register(ns, noop)
  }
  unregister (ns) {
    if (!ns) {
      ns = null // need cannonical form of "empty"
    }
    log('unregister', ns)
    delete this._discover[ns]
    this._client.unregister(ns, noop)
  }
  _discoverLoop() {
    log('discover loop')
    for (const ns in this._discover) {
      this._client.discover(ns, (err, peers) => {
        peers.forEach(peer => {
          this.emit('peer', peer)
          this.emit(ns ? 'ns:' + ns : 'global', peer)
        })
      })
    }
  }
}

module.exports = RendezvousDiscovery
