'use strict'

const debug = require('debug')
const log = debug('libp2p:rendezvous-server')
log.error = debug('libp2p:rendezvous-server:error')

const Libp2p = require('libp2p')
const PeerId = require('peer-id')

const { PROTOCOL_MULTICODEC, MAX_LIMIT } = require('../constants')
const rpc = require('./rpc')

/**
* Rendezvous registration.
* @typedef {Object} Register
* @property {string} ns
* @property {Buffer} signedPeerRecord
* @property {number} ttl
*/

/**
 * Namespace registration.
 * @typedef {Object} NamespaceRegistration
 * @property {string} id
 * @property {number} expiration
 */

/**
 * Libp2p rendezvous server.
 */
class RendezvousServer extends Libp2p {
  /**
     * @constructor
     * @param {Libp2pOptions} libp2pOptions
     * @param {object} [options]
     * @param {number} [options.gcInterval = 3e5]
     */
  constructor (libp2pOptions, { gcInterval = 3e5 } = {}) {
    super(libp2pOptions)

    this._gcInterval = gcInterval

    /**
     * Registrations per namespace.
     * @type {Map<string, Map<string, NamespaceRegistration>>}
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
    super.start()

    if (this._interval) {
      return
    }

    log('starting')

    // Garbage collection
    this._interval = setInterval(this._gc, this._gcInterval)

    // Incoming streams handling
    this.registrar.handle(PROTOCOL_MULTICODEC, rpc(this))

    log('started')
  }

  /**
   * Stops rendezvous server gc and clears registrations
   * @returns {void}
   */
  stop () {
    super.stop()

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
    log('gc starting')

    const now = Date.now()
    const removedIds = []

    // Iterate namespaces
    this.nsRegistrations.forEach((nsEntry) => {
      // Iterate registrations for namespaces
      nsEntry.forEach((nsReg, idStr) => {
        if (now >= nsReg.expiration) {
          nsEntry.delete(idStr)
          removedIds.push(nsReg.id)

          log(`gc removed namespace entry for ${idStr}`)
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
   * @param {Envelope} envelope
   * @param {number} ttl
   * @returns {void}
   */
  addRegistration (ns, peerId, envelope, ttl) {
    const nsReg = this.nsRegistrations.get(ns) || new Map()

    nsReg.set(peerId.toB58String(), {
      id: String(Math.random() + Date.now()),
      expiration: Date.now() + ttl
    })

    this.nsRegistrations.set(ns, nsReg)

    // Store envelope in the AddressBook
    this.peerStore.addressBook.consumePeerRecord(envelope)
  }

  /**
   * Remove registration of a given namespace to a peer
   * @param {string} ns
   * @param {PeerId} peerId
   * @returns {void}
   */
  removeRegistration (ns, peerId) {
    const nsReg = this.nsRegistrations.get(ns)

    if (nsReg) {
      nsReg.delete(peerId.toB58String())

      // Remove registrations map to namespace if empty
      if (!nsReg.size) {
        this.nsRegistrations.delete(ns)
      }
      log('removed existing registrations for the namespace - peer pair:', ns, peerId.toB58String())
    }
  }

  /**
   * Remove all registrations of a given peer
   * @param {PeerId} peerId
   * @returns {void}
   */
  removePeerRegistrations (peerId) {
    for (const [ns, nsReg] of this.nsRegistrations.entries()) {
      nsReg.delete(peerId.toB58String())

      // Remove registrations map to namespace if empty
      if (!nsReg.size) {
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

    for (const [idStr, nsReg] of nsEntry.entries()) {
      if (nsReg.expiration <= Date.now()) {
        // Clean outdated registration from registrations and cookie record
        nsEntry.delete(idStr)
        cRegistrations.delete(nsReg.id)
        continue
      }

      // If this record was already sent, continue
      if (cRegistrations.has(nsReg.id)) {
        continue
      }

      cRegistrations.add(nsReg.id)
      registrations.push({
        ns,
        signedPeerRecord: this.peerStore.addressBook.getRawEnvelope(PeerId.createFromB58String(idStr)),
        ttl: Date.now() - nsReg.expiration
      })

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
