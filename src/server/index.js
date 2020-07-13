'use strict'

const debug = require('debug')
const log = debug('libp2p:redezvous-server')
log.error = debug('libp2p:redezvous-server:error')

const { PROTOCOL_MULTICODEC, MAX_LIMIT } = require('../constants')
const rpc = require('./rpc')

/**
* Rendezvous registration.
* @typedef {Object} Registration
* @property {string} id
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
    this.nsRegistrations = new Map()

    /**
     * Registration ids per cookie.
     * @type {Map<string, Set<string>>}
     */
    this.cookieRegistrations = new Map()

    this._gc = this._gc.bind(this)
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

    this.nsRegistrations.clear()
    this.cookieRegistrations.clear()

    log('stopped')
  }

  /**
   * Garbage collector to removed outdated registrations.
   * @returns {void}
   */
  _gc () {
    const now = Date.now()
    const removedIds = []

    // Iterate namespaces
    this.nsRegistrations.forEach((nsEntry) => {
      // Iterate registrations for namespaces
      nsEntry.forEach((reg, idStr) => {
        if (now >= reg.expiration) {
          nsEntry.delete(idStr)
          removedIds.push(reg.id)
        }
      })
    })

    // Remove outdated records references from cookies
    for (const [key, idSet] of this.cookieRegistrations.entries()) {
      const filteredIds = Array.from(idSet).filter((id) => !removedIds.includes(id))

      if (filteredIds && filteredIds.length) {
        this.cookieRegistrations.set(key, filteredIds)
      } else {
        // Empty
        this.cookieRegistrations.delete(key)
      }
    }
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
    const nsEntry = this.nsRegistrations.get(ns) || new Map()

    nsEntry.set(peerId.toB58String(), {
      id: String(Math.random() + Date.now()),
      peerId,
      addrs,
      expiration: Date.now() + ttl
    })

    this.nsRegistrations.set(ns, nsEntry)
  }

  /**
   * Remove rengistration of a given namespace to a peer
   * @param {string} ns
   * @param {PeerId} peerId
   * @returns {void}
   */
  removeRegistration (ns, peerId) {
    const nsEntry = this.nsRegistrations.get(ns)

    if (nsEntry) {
      nsEntry.delete(peerId.toB58String())

      // Remove registrations map to namespace if empty
      if (!nsEntry.size) {
        this.nsRegistrations.delete(ns)
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
    for (const [ns, reg] of this.nsRegistrations.entries()) {
      reg.delete(peerId.toB58String())

      // Remove registrations map to namespace if empty
      if (!reg.size) {
        this.nsRegistrations.delete(ns)
      }
    }

    log('removed existing registrations for peer', peerId.toB58String())
  }

  /**
   * Get registrations for a namespace
   * @param {string} ns
   * @param {object} [options]
   * @param {number} [options.limit]
   * @param {string} [options.cookie]
   * @returns {{ registrations: Array<Registration>, cookie: string }}
   */
  getRegistrations (ns, { limit = MAX_LIMIT, cookie = String(Math.random() + Date.now()) } = {}) {
    const nsEntry = this.nsRegistrations.get(ns) || new Map()
    const registrations = []
    const cRegistrations = this.cookieRegistrations.get(cookie) || new Set()

    for (const [idStr, reg] of nsEntry.entries()) {
      if (reg.expiration <= Date.now()) {
        // Clean outdated registration from registrations and cookie record
        nsEntry.delete(idStr)
        cRegistrations.delete(reg.id)
        continue
      }

      // If this record was already sent, continue
      if (cRegistrations.has(reg.id)) {
        continue
      }

      cRegistrations.add(reg.id)
      registrations.push(reg)

      // Stop if reached limit
      if (registrations.length === limit) {
        break
      }
    }

    // Save cookie registrations
    this.cookieRegistrations.set(cookie, cRegistrations)

    return {
      registrations,
      cookie
    }
  }
}

module.exports = RendezvousServer
