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

const PeerId = require('peer-id')

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
 * Rendezvous point contains the cookies per namespace that the client received.
 *
 * @typedef {Object} RendezvousPoint
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
   * @param {RendezvousProperties & RendezvousOptions} params
   */
  constructor ({ libp2p, maxRendezvousPoints }) {
    this._libp2p = libp2p
    this._peerId = libp2p.peerId
    this._peerStore = libp2p.peerStore
    this._connectionManager = libp2p.connectionManager

    this._maxRendezvousPoints = maxRendezvousPoints

    this._isStarted = false

    /**
     * @type {Map<string, RendezvousPoint>}
     */
    this._rendezvousPoints = new Map()

    this._onProtocolChange = this._onProtocolChange.bind(this)
  }

  /**
   * Register the rendezvous protocol in the libp2p node.
   *
   * @returns {void}
   */
  start () {
    if (this._isStarted) {
      return
    }

    log('starting')

    this._peerStore.on('change:protocols', this._onProtocolChange)
    this._isStarted = true

    log('started')
  }

  /**
   * Clear the rendezvous state and remove listeners.
   *
   * @returns {void}
   */
  stop () {
    if (!this._isStarted) {
      return
    }

    log('stopping')

    this._peerStore.removeListener('change:protocols', this._onProtocolChange)
    this._rendezvousPoints.clear()

    this._isStarted = false
    log('stopped')
  }

  /**
   * Check if a peer supports the rendezvous protocol.
   * If the protocol is not supported, check if it was supported before and remove it as a rendezvous point.
   * If the protocol is supported, add it to the known rendezvous points.
   *
   * @param {Object} props
   * @param {PeerId} props.peerId
   * @param {Array<string>} props.protocols
   * @returns {void}
   */
  _onProtocolChange ({ peerId, protocols }) {
    const id = peerId.toB58String()

    // Check if it has the protocol
    const hasProtocol = protocols.find(protocol => protocol === PROTOCOL_MULTICODEC)
    const hasRendezvousPoint = this._rendezvousPoints.has(id)

    // If no protocol, check if we were keeping the peer before
    if (!hasProtocol && hasRendezvousPoint) {
      this._rendezvousPoints.delete(id)
      log(`removed ${id} from rendezvous points as it does not suport ${PROTOCOL_MULTICODEC} anymore`)
    } else if (hasProtocol && !this._rendezvousPoints.has(id)) {
      this._rendezvousPoints.set(id, { cookies: new Map() })
    }

    // TODO: Hint that connection can be discarded?
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

    // TODO: we should protect from getting to many rendezvous points and sending to all
    // Should we have a custom max number of servers and a custom sorter function?
    // Default to peers already connected

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
      const connection = await this._libp2p.dial(PeerId.createFromCID(id))
      const { stream } = await connection.newStream(PROTOCOL_MULTICODEC)

      const [response] = await pipe(
        [message],
        lp.encode(),
        stream,
        lp.decode(),
        toBuffer,
        collect
      )

      if (!connection.streams.length) {
        await connection.close()
      }

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
    // pAny here?
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
      const connection = await this._libp2p.dial(PeerId.createFromCID(id))
      const { stream } = await connection.newStream(PROTOCOL_MULTICODEC)

      await pipe(
        [message],
        lp.encode(),
        stream,
        async (source) => {
          for await (const _ of source) { } // eslint-disable-line
        }
      )

      if (!connection.streams.length) {
        await connection.close()
      }
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
      const connection = await this._libp2p.dial(PeerId.createFromCID(id))
      const { stream } = await connection.newStream(PROTOCOL_MULTICODEC)
      const [response] = await pipe(
        [message],
        lp.encode(),
        stream,
        lp.decode(),
        toBuffer,
        collect
      )

      if (!connection.streams.length) {
        await connection.close()
      }

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
