'use strict'

const debug = require('debug')
const log = debug('libp2p:rendezvous-server')
log.error = debug('libp2p:rendezvous-server:error')

const errCode = require('err-code')

const Libp2p = require('libp2p')
const PeerId = require('peer-id')

const { codes: errCodes } = require('../errors')
const rpc = require('./rpc')
const {
  MIN_TTL,
  MAX_TTL,
  MAX_NS_LENGTH,
  MAX_DISCOVER_LIMIT,
  PROTOCOL_MULTICODEC
} = require('./constants')

/**
 * @typedef {Object} Register
 * @property {string} ns
 * @property {Buffer} signedPeerRecord
 * @property {number} ttl
 *
 * @typedef {Object} NamespaceRegistration
 * @property {string} id
 * @property {number} expiration
 */

/**
 * @typedef {Object} RendezvousServerOptions
 * @property {number} [gcDelay = 3e5] garbage collector delay (default: 5 minutes)
 * @property {number} [gcInterval = 7.2e6] garbage collector interval (default: 2 hours)
 * @property {number} [minTtl = MIN_TTL] minimum acceptable ttl to store a registration
 * @property {number} [maxTtl = MAX_TTL] maxium acceptable ttl to store a registration
 * @property {number} [maxNsLength = MAX_NS_LENGTH] maxium acceptable namespace length
 * @property {number} [maxDiscoverLimit = MAX_DISCOVER_LIMIT] maxium acceptable discover limit
 */

/**
 * Libp2p rendezvous server.
 */
class RendezvousServer extends Libp2p {
  /**
   * @class
   * @param {Libp2pOptions} libp2pOptions
   * @param {RendezvousServerOptions} [options]
   */
  constructor (libp2pOptions, options = {}) {
    super(libp2pOptions)

    this._gcDelay = options.gcDelay || 3e5
    this._gcInterval = options.gcInterval || 7.2e6
    this._minTtl = options.minTtl || MIN_TTL
    this._maxTtl = options.maxTtl || MAX_TTL
    this._maxNsLength = options.maxNsLength || MAX_NS_LENGTH
    this._maxDiscoveryLimit = options.maxDiscoverLimit || MAX_DISCOVER_LIMIT

    /**
     * Registrations per namespace.
     *
     * @type {Map<string, Map<string, NamespaceRegistration>>}
     */
    this.nsRegistrations = new Map()

    /**
     * Registration ids per cookie.
     *
     * @type {Map<string, Set<string>>}
     */
    this.cookieRegistrations = new Map()

    this._gc = this._gc.bind(this)
  }

  /**
   * Start rendezvous server for handling rendezvous streams and gc.
   *
   * @returns {void}
   */
  start () {
    super.start()

    if (this._interval) {
      return
    }

    log('starting')

    // Garbage collection
    this._timeout = setInterval(this._gc, this._gcDelay)

    // Incoming streams handling
    this.handle(PROTOCOL_MULTICODEC, rpc(this))

    log('started')
  }

  /**
   * Stops rendezvous server gc and clears registrations
   *
   * @returns {void}
   */
  stop () {
    this.unhandle(PROTOCOL_MULTICODEC)

    clearTimeout(this._timeout)
    this._interval = undefined

    this.nsRegistrations.clear()
    this.cookieRegistrations.clear()

    super.stop()
    log('stopped')
  }

  /**
   * Garbage collector to removed outdated registrations.
   *
   * @returns {void}
   */
  _gc () {
    log('gc starting')
    // TODO: delete addressBook

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

    if (!this._timeout) {
      return
    }

    this._timeout = setInterval(this._gc, this._gcInterval)
  }

  /**
   * Add a peer registration to a namespace.
   *
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
   *
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
   *
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
   *
   * @param {string} ns
   * @param {object} [options]
   * @param {number} [options.limit]
   * @param {string} [options.cookie]
   * @returns {{ registrations: Array<Registration>, cookie: string }}
   */
  getRegistrations (ns, { limit = MAX_DISCOVER_LIMIT, cookie } = {}) {
    const nsEntry = this.nsRegistrations.get(ns) || new Map()
    const registrations = []

    // Get the cookie registration if provided, create a cookie otherwise
    let cRegistrations = new Set()
    if (cookie) {
      cRegistrations = this.cookieRegistrations.get(cookie)
    } else {
      cookie = String(Math.random() + Date.now())
    }

    if (!cRegistrations) {
      throw errCode(new Error('no registrations for the given cookie'), errCodes.INVALID_COOKIE)
    }

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
