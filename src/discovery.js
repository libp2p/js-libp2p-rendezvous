'use strict'

const debug = require('debug')
const log = debug('libp2p:redezvous:discovery')
log.error = debug('libp2p:redezvous:discovery:error')

const { EventEmitter } = require('events')

const defaultOptions = {
  interval: 5000
}

/**
 * Libp2p Rendezvous discovery service.
 */
class Discovery extends EventEmitter {
  /**
   * @constructor
   * @param {Rendezvous} rendezvous
   * @param {Object} [options]
   * @param {number} [options.interval = 5000]
   */
  constructor (rendezvous, options = {}) {
    super()
    this._rendezvous = rendezvous
    this._options = {
      ...defaultOptions,
      ...options
    }
    this._interval = undefined
  }

  /**
   * Start discovery service.
   * @returns {void}
   */
  start () {
    if (this._interval) {
      return
    }

    this._interval = setInterval(() => this._discover(), this._options.interval)
  }

  /**
   * Stop discovery service.
   * @returns {void}
   */
  stop () {
    clearInterval(this._interval)
    this._interval = null
  }

  /**
   * Iterates over the registered namespaces and tries to discover new peers
   * @returns {void}
   */
  _discover () {
    this._rendezvous._namespaces.forEach(async (ns) => {
      for await (const reg of this._rendezvous.discover(ns)) {
        // TODO: interface-peer-discovery with signedPeerRecord
        this.emit('peer', {
          id: reg.id,
          multiaddrs: reg.multiaddrs
        })
      }
    })
  }
}

module.exports = Discovery
