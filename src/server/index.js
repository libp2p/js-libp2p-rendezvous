'use strict'

const debug = require('debug')
const log = Object.assign(debug('libp2p:rendezvous-server'), {
  error: debug('libp2p:rendezvous-server:err')
})
const {
  setDelayedInterval,
  clearDelayedInterval
} = require('set-delayed-interval')

const Libp2p = require('libp2p')
const PeerId = require('peer-id')

const rpc = require('./rpc')
const {
  MIN_TTL,
  MAX_TTL,
  MAX_NS_LENGTH,
  MAX_DISCOVER_LIMIT,
  MAX_PEER_REGISTRATIONS,
  GC_BOOT_DELAY,
  GC_INTERVAL,
  GC_MIN_INTERVAL,
  GC_MIN_REGISTRATIONS,
  GC_MAX_REGISTRATIONS,
  PROTOCOL_MULTICODEC
} = require('./constants')
const { fallbackNullish } = require('./utils')

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
 * @property {number} [maxPeerRegistrations = MAX_PEER_REGISTRATIONS] maxium acceptable registrations per peer
 * @property {number} [gcBootDelay = GC_BOOT_DELAY] delay before starting garbage collector job
 * @property {number} [gcMinInterval = GC_MIN_INTERVAL] minimum interval between each garbage collector job, in case maximum threshold reached
 * @property {number} [gcInterval = GC_INTERVAL] interval between each garbage collector job
 * @property {number} [gcMinRegistrations = GC_MIN_REGISTRATIONS] minimum number of registration for triggering garbage collector
 * @property {number} [gcMaxRegistrations = GC_MAX_REGISTRATIONS] maximum number of registration for triggering garbage collector
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

    this._minTtl = fallbackNullish(options.minTtl, MIN_TTL)
    this._maxTtl = fallbackNullish(options.maxTtl, MAX_TTL)
    this._maxNsLength = fallbackNullish(options.maxNsLength, MAX_NS_LENGTH)
    this._maxDiscoveryLimit = fallbackNullish(options.maxDiscoveryLimit, MAX_DISCOVER_LIMIT)
    this._maxPeerRegistrations = fallbackNullish(options.maxPeerRegistrations, MAX_PEER_REGISTRATIONS)

    this.rendezvousDatastore = options.datastore

    this._registrationsCount = 0
    this._lastGcTs = 0
    this._gcDelay = fallbackNullish(options.gcBootDelay, GC_BOOT_DELAY)
    this._gcInterval = fallbackNullish(options.gcInterval, GC_INTERVAL)
    this._gcMinInterval = fallbackNullish(options.gcMinInterval, GC_MIN_INTERVAL)
    this._gcMinRegistrations = fallbackNullish(options.gcMinRegistrations, GC_MIN_REGISTRATIONS)
    this._gcMaxRegistrations = fallbackNullish(options.gcMaxRegistrations, GC_MAX_REGISTRATIONS)
    this._gcJob = this._gcJob.bind(this)
  }

  /**
   * Start rendezvous server for handling rendezvous streams and gc.
   *
   * @returns {Promise<void>}
   */
  async start () {
    super.start()

    if (this._timeout) {
      return
    }

    log('starting')

    await this.rendezvousDatastore.start()

    // Garbage collection
    this._timeout = setDelayedInterval(
      this._gcJob, this._gcInterval, this._gcDelay
    )

    // Incoming streams handling
    this.handle(PROTOCOL_MULTICODEC, rpc(this))

    // Remove peer records from memory as they are not needed
    // TODO: This should be handled by PeerStore itself in the future
    this.peerStore.on('peer', (peerId) => {
      this.peerStore.delete(peerId)
    })

    log('started')
  }

  /**
   * Stops rendezvous server gc and clears registrations
   *
   * @returns {Promise<void>}
   */
  stop () {
    this.unhandle(PROTOCOL_MULTICODEC)
    clearDelayedInterval(this._timeout)

    this.rendezvousDatastore.stop()

    super.stop()
    log('stopped')

    return Promise.resolve()
  }

  /**
   * Call garbage collector if enough registrations.
   *
   * @returns {Promise<void>}
   */
  async _gcJob () {
    if (this._registrationsCount > this._gcMinRegistrations && Date.now() > this._gcMinInterval + this._lastGcTs) {
      await this._gc()
    }
  }

  /**
   * Run datastore garbage collector.
   *
   * @returns {Promise<void>}
   */
  async _gc () {
    log('gc starting')

    const count = await this.rendezvousDatastore.gc()
    this._registrationsCount -= count
    this._lastGcTs = Date.now()

    log('gc finished')
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

    this._registrationsCount += 1
    // Manually trigger garbage collector if max registrations threshold reached
    // and the minGc interval is finished
    if (this._registrationsCount >= this._gcMaxRegistrations && Date.now() > this._gcMinInterval + this._lastGcTs) {
      this._gc()
    }
  }

  /**
   * Remove registration of a given namespace to a peer
   *
   * @param {string} ns
   * @param {PeerId} peerId
   * @returns {Promise<void>}
   */
  async removeRegistration (ns, peerId) {
    const count = await this.rendezvousDatastore.removeRegistration(ns, peerId)
    log(`removed existing registrations for the namespace ${ns} - peer ${peerId.toB58String()} pair`)

    this._registrationsCount -= count
  }

  /**
   * Remove all registrations of a given peer
   *
   * @param {PeerId} peerId
   * @returns {Promise<void>}
   */
  async removePeerRegistrations (peerId) {
    const count = await this.rendezvousDatastore.removePeerRegistrations(peerId)
    log(`removed existing registrations for peer ${peerId.toB58String()}`)

    this._registrationsCount -= count
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
