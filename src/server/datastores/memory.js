'use strict'

const debug = require('debug')
const log = debug('libp2p:rendezvous-server:memory')
log.error = debug('libp2p:rendezvous-server:memory:error')

const errCode = require('err-code')
const { codes: errCodes } = require('../errors')

const PeerId = require('peer-id')

/**
 * @typedef {import('peer-id')} PeerId
 * @typedef {import('./interface').Datastore} Datastore
 * @typedef {import('./interface').Registration} Registration
 */

/** *
 *
 * @typedef {Object} NamespaceRegistration
 * @property {string} id random generated id to map cookies
 * @property {Uint8Array} signedPeerRecord
 * @property {number} expiration
 */

/**
 * @implements {Datastore}
 */
class Memory {
  /**
   * Memory datastore for libp2p rendezvous.
   */
  constructor () {
    /**
     * Registrations per namespace, where a registration maps peer id strings to a namespace reg.
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
  }

  /**
   * @returns {Promise<void>}
   */
  start () {
    return Promise.resolve()
  }

  stop () {}

  reset () {
    this.nsRegistrations.clear()
    this.cookieRegistrations.clear()
    return Promise.resolve()
  }

  /**
   * Add an entry to the registration table.
   *
   * @param {string} ns
   * @param {PeerId} peerId
   * @param {Uint8Array} signedPeerRecord
   * @param {number} ttl
   * @returns {Promise<void>}
   */
  addRegistration (ns, peerId, signedPeerRecord, ttl) {
    const nsReg = this.nsRegistrations.get(ns) || new Map()

    nsReg.set(peerId.toB58String(), {
      id: String(Math.random() + Date.now()),
      expiration: Date.now() + ttl,
      signedPeerRecord
    })

    this.nsRegistrations.set(ns, nsReg)

    return Promise.resolve()
  }

  /**
   * Get registrations for a given namespace
   *
   * @param {string} ns
   * @param {object} [options]
   * @param {number} [options.limit = 10]
   * @param {string} [options.cookie]
   * @returns {Promise<{ registrations: Array<Registration>, cookie: string }>}
   */
  getRegistrations (ns, { limit = 10, cookie } = {}) {
    const nsEntry = this.nsRegistrations.get(ns) || new Map()
    const registrations = []

    // Get the cookie registration if provided, create a cookie otherwise
    let cRegistrations
    if (cookie) {
      cRegistrations = this.cookieRegistrations.get(cookie)
    } else {
      cRegistrations = new Set()
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
        signedPeerRecord: nsReg.signedPeerRecord,
        ttl: nsReg.expiration - Date.now() // TODO: do not add if invalid?
      })

      // Stop if reached limit
      if (registrations.length === limit) {
        break
      }
    }

    // Save cookie registrations
    this.cookieRegistrations.set(cookie, cRegistrations)

    return Promise.resolve({
      registrations,
      cookie
    })
  }

  /**
   * Get number of registrations of a given peer.
   *
   * @param {PeerId} peerId
   * @returns {Promise<number>}
   */
  getNumberOfRegistrationsFromPeer (peerId) {
    const namespaces = []

    this.nsRegistrations.forEach((nsEntry, namespace) => {
      if (nsEntry.has(peerId.toB58String())) {
        namespaces.push(namespace)
      }
    })

    return Promise.resolve(namespaces.length)
  }

  /**
   * Remove registration of a given namespace to a peer
   *
   * @param {string} ns
   * @param {PeerId} peerId
   * @returns {Promise<void>}
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

    return Promise.resolve()
  }

  /**
   * Remove all registrations of a given peer
   *
   * @param {PeerId} peerId
   * @returns {Promise<void>}
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
    return Promise.resolve()
  }
}

module.exports = Memory
