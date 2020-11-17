'use strict'

const debug = require('debug')
const log = debug('libp2p:rendezvous')
log.error = debug('libp2p:rendezvous:error')

const errCode = require('err-code')
const pipe = require('it-pipe')
const lp = require('it-length-prefixed')
const { collect } = require('streaming-iterables')
const { toBuffer } = require('it-buffer')
const fromString = require('uint8arrays/from-string')
const toString = require('uint8arrays/to-string')

const MulticodecTopology = require('libp2p-interfaces/src/topology/multicodec-topology')

const { codes: errCodes } = require('./errors')
const {
  MAX_DISCOVER_LIMIT,
  PROTOCOL_MULTICODEC
} = require('./constants')
const { Message } = require('./proto')
const MESSAGE_TYPE = Message.MessageType

/**
 * @typedef {import('libp2p')} Libp2p
 */

/**
 * Rendezvous point contains the connection to a rendezvous server, as well as,
 * the cookies per namespace that the client received.
 *
 * @typedef {Object} RendezvousPoint
 * @property {Connection} connection
 * @property {Map<string, string>} cookies
 */

/**
 * @typedef {Object} RendezvousProperties
 * @property {Libp2p} libp2p
 */
class Rendezvous {
  /**
   * Libp2p Rendezvous. A lightweight mechanism for generalized peer discovery.
   *
   * @class
   * @param {RendezvousProperties} params
   */
  constructor ({ libp2p }) {
    this._libp2p = libp2p
    this._peerId = libp2p.peerId
    this._registrar = libp2p.registrar

    /**
     * @type {Map<string, RendezvousPoint>}
     */
    this._rendezvousPoints = new Map()

    this._registrarId = undefined
    this._onPeerConnected = this._onPeerConnected.bind(this)
    this._onPeerDisconnected = this._onPeerDisconnected.bind(this)
  }

  /**
   * Register the rendezvous protocol in the libp2p node.
   *
   * @returns {void}
   */
  start () {
    if (this._registrarId) {
      return
    }

    log('starting')

    // register protocol with topology
    const topology = new MulticodecTopology({
      multicodecs: PROTOCOL_MULTICODEC,
      handlers: {
        onConnect: this._onPeerConnected,
        onDisconnect: this._onPeerDisconnected
      }
    })
    this._registrarId = this._registrar.register(topology)

    log('started')
  }

  /**
   * Unregister the rendezvous protocol and clear the state.
   *
   * @returns {void}
   */
  stop () {
    if (!this._registrarId) {
      return
    }

    log('stopping')

    // unregister protocol and handlers
    this._registrar.unregister(this._registrarId)

    this._registrarId = undefined
    this._rendezvousPoints.clear()

    log('stopped')
  }

  /**
   * Registrar notifies a connection successfully with rendezvous protocol.
   *
   * @private
   * @param {PeerId} peerId - remote peer-id
   * @param {Connection} conn - connection to the peer
   */
  _onPeerConnected (peerId, conn) {
    const idB58Str = peerId.toB58String()
    log('connected', idB58Str)

    this._rendezvousPoints.set(idB58Str, { connection: conn })
  }

  /**
   * Registrar notifies a closing connection with rendezvous protocol.
   *
   * @private
   * @param {PeerId} peerId - peerId
   */
  _onPeerDisconnected (peerId) {
    const idB58Str = peerId.toB58String()
    log('disconnected', idB58Str)

    this._rendezvousPoints.delete(idB58Str)
  }

  /**
   * Register the peer in a given namespace
   *
   * @param {string} ns
   * @param {object} [options]
   * @param {number} [options.ttl = 7.2e6] - registration ttl in ms
   * @returns {Promise<number>} rendezvous register ttl.
   */
  async register (ns, { ttl = 7.2e6 } = {}) {
    if (!ns) {
      throw errCode(new Error('a namespace must be provided'), errCodes.INVALID_NAMESPACE)
    }

    // Are there available rendezvous servers?
    if (!this._rendezvousPoints.size) {
      throw errCode(new Error('no rendezvous servers connected'), errCodes.NO_CONNECTED_RENDEZVOUS_SERVERS)
    }

    const message = Message.encode({
      type: MESSAGE_TYPE.REGISTER,
      register: {
        signedPeerRecord: this._libp2p.peerStore.addressBook.getRawEnvelope(this._peerId),
        ns,
        ttl: ttl * 1e-3 // Convert to seconds
      }
    })

    const registerTasks = []
    const taskFn = async (id) => {
      const { connection } = this._rendezvousPoints.get(id)
      const { stream } = await connection.newStream(PROTOCOL_MULTICODEC)

      const [response] = await pipe(
        [message],
        lp.encode(),
        stream,
        lp.decode(),
        toBuffer,
        collect
      )

      const recMessage = Message.decode(response)

      if (!recMessage.type === MESSAGE_TYPE.REGISTER_RESPONSE) {
        throw new Error('unexpected message received')
      }

      if (recMessage.registerResponse.status !== Message.ResponseStatus.OK) {
        throw errCode(new Error(recMessage.registerResponse.statusText), recMessage.registerResponse.status)
      }

      return recMessage.registerResponse.ttl * 1e3 // convert to ms
    }

    for (const id of this._rendezvousPoints.keys()) {
      registerTasks.push(taskFn(id))
    }

    // Return first ttl
    const [returnTtl] = await Promise.all(registerTasks)

    return returnTtl
  }

  /**
   * Unregister peer from the nampesapce.
   *
   * @param {string} ns
   * @returns {Promise<void>}
   */
  async unregister (ns) {
    if (!ns) {
      throw errCode(new Error('a namespace must be provided'), errCodes.INVALID_NAMESPACE)
    }

    // Are there available rendezvous servers?
    if (!this._rendezvousPoints.size) {
      throw errCode(new Error('no rendezvous servers connected'), errCodes.NO_CONNECTED_RENDEZVOUS_SERVERS)
    }

    const message = Message.encode({
      type: MESSAGE_TYPE.UNREGISTER,
      unregister: {
        id: this._peerId.toBytes(),
        ns
      }
    })

    const unregisterTasks = []
    const taskFn = async (id) => {
      const { connection } = this._rendezvousPoints.get(id)
      const { stream } = await connection.newStream(PROTOCOL_MULTICODEC)

      await pipe(
        [message],
        lp.encode(),
        stream,
        async (source) => {
          for await (const _ of source) { } // eslint-disable-line
        }
      )
    }

    for (const id of this._rendezvousPoints.keys()) {
      unregisterTasks.push(taskFn(id))
    }

    await Promise.all(unregisterTasks)
  }

  /**
   * Discover peers registered under a given namespace
   *
   * @param {string} ns
   * @param {number} [limit = MAX_DISCOVER_LIMIT]
   * @returns {AsyncIterable<{ signedPeerRecord: Uint8Array, ns: string, ttl: number }>}
   */
  async * discover (ns, limit = MAX_DISCOVER_LIMIT) {
    // Are there available rendezvous servers?
    if (!this._rendezvousPoints.size) {
      throw errCode(new Error('no rendezvous servers connected'), errCodes.NO_CONNECTED_RENDEZVOUS_SERVERS)
    }

    const registrationTransformer = (r) => ({
      signedPeerRecord: r.signedPeerRecord,
      ns: r.ns,
      ttl: r.ttl * 1e3 // convert to ms
    })

    // Iterate over all rendezvous points
    for (const [id, rp] of this._rendezvousPoints.entries()) {
      const rpCookies = rp.cookies || new Map()

      // Check if we have a cookie and encode discover message
      const cookie = rpCookies.get(ns)
      const message = Message.encode({
        type: MESSAGE_TYPE.DISCOVER,
        discover: {
          ns,
          limit,
          cookie: cookie ? fromString(cookie) : undefined
        }
      })

      // Send discover message and wait for response
      const { stream } = await rp.connection.newStream(PROTOCOL_MULTICODEC)
      const [response] = await pipe(
        [message],
        lp.encode(),
        stream,
        lp.decode(),
        toBuffer,
        collect
      )

      const recMessage = Message.decode(response)

      if (!recMessage.type === MESSAGE_TYPE.DISCOVER_RESPONSE) {
        throw new Error('unexpected message received')
      } else if (recMessage.discoverResponse.status !== Message.ResponseStatus.OK) {
        throw errCode(new Error(recMessage.discoverResponse.statusText), recMessage.discoverResponse.status)
      }

      // Iterate over registrations response
      for (const r of recMessage.discoverResponse.registrations) {
        // track registrations
        yield registrationTransformer(r)

        // Store cookie
        rpCookies.set(ns, toString(recMessage.discoverResponse.cookie))
        this._rendezvousPoints.set(id, {
          connection: rp.connection,
          cookies: rpCookies
        })

        limit--
        if (limit === 0) {
          return
        }
      }
    }
  }
}

module.exports = Rendezvous
