'use strict'

const debug = require('debug')
const log = Object.assign(debug('libp2p:rendezvous-server'), {
  error: debug('libp2p:rendezvous-server:err')
})

const Libp2p = require('libp2p')
const PeerId = require('peer-id')

const rpc = require('./rpc')
const {
  MIN_TTL,
  MAX_TTL,
  MAX_NS_LENGTH,
  MAX_DISCOVER_LIMIT,
  MAX_REGISTRATIONS,
  PROTOCOL_MULTICODEC
} = require('./constants')

/**
 * @typedef {import('./datastores/interface').Datastore} Datastore
 * @typedef {import('./datastores/interface').Registration} Registration
 *
 * @typedef {Object} NamespaceRegistration
 * @property {string} id random generated id to map cookies
 * @property {number} expiration
 */

/**
 * @typedef {Object} RendezvousServerOptions
 * @property {Datastore} datastore
 * @property {number} [gcDelay = 3e5] garbage collector delay (default: 5 minutes)
 * @property {number} [gcInterval = 7.2e6] garbage collector interval (default: 2 hours)
 * @property {number} [minTtl = MIN_TTL] minimum acceptable ttl to store a registration
 * @property {number} [maxTtl = MAX_TTL] maxium acceptable ttl to store a registration
 * @property {number} [maxNsLength = MAX_NS_LENGTH] maxium acceptable namespace length
 * @property {number} [maxDiscoveryLimit = MAX_DISCOVER_LIMIT] maxium acceptable discover limit
 * @property {number} [maxRegistrations = MAX_REGISTRATIONS] maxium acceptable registrations per peer
 */

/**
 * Libp2p rendezvous server.
 */
class RendezvousServer extends Libp2p {
  /**
   * @class
   * @param {import('libp2p').Libp2pOptions} libp2pOptions
   * @param {RendezvousServerOptions} options
   */
  constructor (libp2pOptions, options) {
    super(libp2pOptions)

    this._gcDelay = options.gcDelay || 3e5
    this._gcInterval = options.gcInterval || 7.2e6
    this._minTtl = options.minTtl || MIN_TTL
    this._maxTtl = options.maxTtl || MAX_TTL
    this._maxNsLength = options.maxNsLength || MAX_NS_LENGTH
    this._maxDiscoveryLimit = options.maxDiscoveryLimit || MAX_DISCOVER_LIMIT
    this._maxRegistrations = options.maxRegistrations || MAX_REGISTRATIONS

    this.rendezvousDatastore = options.datastore

    // TODO: REMOVE!
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

    this._gc = this._gc.bind(this)
  }

  /**
   * Start rendezvous server for handling rendezvous streams and gc.
   *
   * @returns {Promise<void>}
   */
  async start () {
    super.start()

    // if (this._interval) {
    //   return
    // }

    log('starting')

    await this.rendezvousDatastore.start()

    // TODO: + use module
    // Garbage collection
    // this._timeout = setInterval(this._gc, this._gcDelay)

    // Incoming streams handling
    this.handle(PROTOCOL_MULTICODEC, rpc(this))

    log('started')
  }

  /**
   * Stops rendezvous server gc and clears registrations
   *
   * @returns {Promise<void>}
   */
  stop () {
    this.unhandle(PROTOCOL_MULTICODEC)

    // clearTimeout(this._timeout)

    this.rendezvousDatastore.stop()

    super.stop()
    log('stopped')

    return Promise.resolve()
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
        this.cookieRegistrations.set(key, new Set(filteredIds))
      } else {
        // Empty
        this.cookieRegistrations.delete(key)
      }
    }

    // if (!this._timeout) {
    //   return
    // }

    // this._timeout = setInterval(this._gc, this._gcInterval)
  }

  /**
   * Add a peer registration to a namespace.
   *
   * @param {string} ns
   * @param {PeerId} peerId
   * @param {Uint8Array} signedPeerRecord
   * @param {number} ttl
   * @returns {Promise<void>}
   */
  async addRegistration (ns, peerId, signedPeerRecord, ttl) {
    await this.rendezvousDatastore.addRegistration(ns, peerId, signedPeerRecord, ttl)
    log(`added registration for the namespace ${ns} with peer ${peerId.toB58String()}`)
  }

  /**
   * Remove registration of a given namespace to a peer
   *
   * @param {string} ns
   * @param {PeerId} peerId
   * @returns {Promise<void>}
   */
  async removeRegistration (ns, peerId) {
    await this.rendezvousDatastore.removeRegistration(ns, peerId)
    log(`removed existing registrations for the namespace ${ns} - peer ${peerId.toB58String()} pair`)
  }

  /**
   * Remove all registrations of a given peer
   *
   * @param {PeerId} peerId
   * @returns {Promise<void>}
   */
  async removePeerRegistrations (peerId) {
    await this.rendezvousDatastore.removePeerRegistrations(peerId)
    log(`removed existing registrations for peer ${peerId.toB58String()}`)
  }

  /**
   * Get registrations for a namespace
   *
   * @param {string} ns
   * @param {object} [options]
   * @param {number} [options.limit]
   * @param {string} [options.cookie]
   * @returns {Promise<{ registrations: Array<Registration>, cookie?: string }>}
   */
  async getRegistrations (ns, { limit = MAX_DISCOVER_LIMIT, cookie } = {}) {
    return await this.rendezvousDatastore.getRegistrations(ns, { limit, cookie })
  }

  /**
   * Get number of registrations of a given peer.
   *
   * @param {PeerId} peerId
   * @returns {Promise<number>}
   */
  async getNumberOfRegistrationsFromPeer (peerId) {
    return await this.rendezvousDatastore.getNumberOfRegistrationsFromPeer(peerId)
  }
}

module.exports = RendezvousServer
