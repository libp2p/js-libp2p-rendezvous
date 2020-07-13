'use strict'

const debug = require('debug')
const log = debug('libp2p:redezvous-server')
log.error = debug('libp2p:redezvous-server:error')

const { PROTOCOL_MULTICODEC, MAX_LIMIT } = require('../constants')
const rpc = require('./rpc')

/**
* Rendezvous registration.
* @typedef {Object} Registration
* @property {PeerId} peerId
* @property {Array<Buffer>} addrs
* @property {number} expiration
*/

/**
 * Libp2p rendezvous server.
 */
class RendezvousServer {
  /**
     * @constructor
     * @param {Registrar} registrar
     * @param {object} options
     * @param {number} options.gcInterval
     */
  constructor (registrar, { gcInterval = 3e5 } = {}) {
    this._registrar = registrar
    this._gcInterval = gcInterval

    /**
     * Registrations per namespace.
     * @type {Map<string, Map<string, Registration>>}
     */
    this.registrations = new Map()
  }

  /**
   * Start rendezvous server for handling rendezvous streams and gc.
   * @returns {void}
   */
  start () {
    if (this._interval) {
      return
    }

    log('starting')

    // Garbage collection
    this._interval = setInterval(this._gc, this._gcInterval)

    // Incoming streams handling
    this._registrar.handle(PROTOCOL_MULTICODEC, rpc(this))

    log('started')
  }

  /**
   * Stops rendezvous server gc and clears registrations
   */
  stop () {
    clearInterval(this._interval)
    this._interval = undefined
    this.registrations.clear()

    log('stopped')
  }

  /**
   * Garbage collector to removed outdated registrations.
   * @returns {void}
   */
  _gc () {
    const now = Date.now()

    // Iterate namespaces
    this.registrations.forEach((nsRegistrations) => {
      // Iterate registrations for namespaces
      nsRegistrations.forEach((reg, idStr) => {
        if (now >= reg.expiration) {
          nsRegistrations.delete(idStr)
        }
      })
    })
  }

  /**
   * Add a peer registration to a namespace.
   * @param {string} ns
   * @param {PeerId} peerId
   * @param {Array<Buffer>} addrs
   * @param {number} ttl
   * @returns {void}
   */
  addRegistration (ns, peerId, addrs, ttl) {
    const nsRegistrations = this.registrations.get(ns) || new Map()

    nsRegistrations.set(peerId.toB58String(), {
      peerId,
      addrs,
      expiration: Date.now() + ttl
    })

    this.registrations.set(ns, nsRegistrations)
  }

  /**
   * Remove rengistration of a given namespace to a peer
   * @param {string} ns
   * @param {PeerId} peerId
   * @returns {void}
   */
  removeRegistration (ns, peerId) {
    const nsRegistrations = this.registrations.get(ns)

    if (nsRegistrations) {
      nsRegistrations.delete(peerId.toB58String())

      // Remove registrations map to namespace if empty
      if (!nsRegistrations.size) {
        this.registrations.delete(ns)
      }
      log('removed existing registrations for the namespace - peer pair:', ns, peerId.toB58String())
    }
  }

  /**
   * Remove registrations of a given peer
   * @param {PeerId} peerId
   * @returns {void}
   */
  removePeerRegistrations (peerId) {
    for (const [ns, reg] of this.registrations.entries()) {
      reg.delete(peerId.toB58String())

      // Remove registrations map to namespace if empty
      if (!reg.size) {
        this.registrations.delete(ns)
      }
    }

    log('removed existing registrations for peer', peerId.toB58String())
  }

  /**
   * Get registrations for a namespace
   * @param {string} ns
   * @param {number} limit
   * @returns {Array<Registration>}
   */
  getRegistrations (ns, limit = MAX_LIMIT) {
    const nsRegistrations = this.registrations.get(ns) || new Map()
    const registrations = []

    for (const [idStr, reg] of nsRegistrations.entries()) {
      if (reg.expiration <= Date.now()) {
        // Clean outdated registration
        nsRegistrations.delete(idStr)
        continue
      }

      registrations.push({
        ns,
        peer: {
          id: reg.peerId.toBytes(),
          addrs: reg.addrs
        },
        ttl: reg.expiration - Date.now()
      })

      // Stop if reached limit
      if (registrations.length === limit) {
        break
      }
    }
    return registrations
  }
}

module.exports = RendezvousServer
