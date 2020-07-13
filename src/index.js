'use strict'

const debug = require('debug')
const log = debug('libp2p:redezvous')
log.error = debug('libp2p:redezvous:error')

const errCode = require('err-code')
const pipe = require('it-pipe')
const lp = require('it-length-prefixed')
const { collect } = require('streaming-iterables')
const { toBuffer } = require('it-buffer')

const MulticodecTopology = require('libp2p-interfaces/src/topology/multicodec-topology')
const multiaddr = require('multiaddr')
const PeerId = require('peer-id')

const Discovery = require('./discovery')
const Server = require('./server')
const { codes: errCodes } = require('./errors')
const { PROTOCOL_MULTICODEC } = require('./constants')
const { Message } = require('./proto')
const MESSAGE_TYPE = Message.MessageType

const defaultServerOptions = {
  enabled: true,
  gcInterval: 3e5
}

/**
 * Libp2p Rendezvous.
 * A lightweight mechanism for generalized peer discovery.
 */
class Rendezvous {
  /**
   * @constructor
   * @param {object} params
   * @param {Libp2p} params.libp2p
   * @param {object} params.options
   * @param {Array<string>} [params.namespaces = []]
   * @param {object} [params.discovery]
   * @param {number} [params.discovery.interval = 5000]
   * @param {object} [params.server]
   * @param {boolean} [params.server.enabled = true]
   * @param {number} [params.server.gcInterval = 3e5]
   */
  constructor ({ libp2p, options = {} }) {
    this._libp2p = libp2p
    this._peerId = libp2p.peerId
    this._registrar = libp2p.registrar

    this._namespaces = options.namespaces || []
    this.discovery = new Discovery(this, options.discovery)

    this._serverOptions = {
      ...defaultServerOptions,
      ...options.server || {}
    }

    /**
     * @type {Map<string, Connection>}
     */
    this._rendezvousConns = new Map()

    this._server = undefined

    this._registrarId = undefined
    this._onPeerConnected = this._onPeerConnected.bind(this)
    this._onPeerDisconnected = this._onPeerDisconnected.bind(this)
  }

  /**
   * Register the rendezvous protocol in the libp2p node.
   * @returns {Promise<void>}
   */
  async start () {
    if (this._registrarId) {
      return
    }

    log('starting')

    // Create Rendezvous point if enabled
    if (this._serverOptions.enabled) {
      this._server = new Server(this._registrar, this._serverOptions)
      this._server.start()
    }

    // register protocol with topology
    const topology = new MulticodecTopology({
      multicodecs: PROTOCOL_MULTICODEC,
      handlers: {
        onConnect: this._onPeerConnected,
        onDisconnect: this._onPeerDisconnected
      }
    })
    this._registrarId = await this._registrar.register(topology)

    log('started')

    this._keepRegistrations()
  }

  /**
   * Unregister the rendezvous protocol and the streams with other peers will be closed.
   * @returns {Promise<void>}
   */
  async stop () {
    if (!this._registrarId) {
      return
    }

    log('stopping')

    clearInterval(this._interval)

    // unregister protocol and handlers
    await this._registrar.unregister(this._registrarId)
    if (this._serverOptions.enabled) {
      this._server.stop()
    }

    this._registrarId = undefined
    log('stopped')
  }

  _keepRegistrations () {
    const register = () => {
      if (!this._rendezvousConns.size) {
        return
      }

      const promises = []

      this._namespaces.forEach((ns) => {
        promises.push(this.register(ns))
      })

      return Promise.all(promises)
    }

    register()
    this._interval = setInterval(register, 1000)
  }

  /**
   * Registrar notifies a connection successfully with rendezvous protocol.
   * @private
   * @param {PeerId} peerId remote peer-id
   * @param {Connection} conn connection to the peer
   */
  _onPeerConnected (peerId, conn) {
    const idB58Str = peerId.toB58String()
    log('connected', idB58Str)

    this._rendezvousConns.set(idB58Str, conn)
  }

  /**
   * Registrar notifies a closing connection with rendezvous protocol.
   * @private
   * @param {PeerId} peerId peerId
   */
  _onPeerDisconnected (peerId) {
    const idB58Str = peerId.toB58String()
    log('disconnected', idB58Str)

    this._rendezvousConns.delete(idB58Str)

    if (this._server) {
      this._server.removePeerRegistrations(peerId)
    }
  }

  /**
   * Register the peer in a given namespace
   * @param {string} ns
   * @param {number} [ttl = 7200e3] registration ttl in ms (minimum 120)
   * @returns {Promise<number>}
   */
  async register (ns, ttl = 7200e3) {
    if (!ns) {
      throw errCode(new Error('a namespace must be provided'), errCodes.INVALID_NAMESPACE)
    }

    if (ttl < 120) {
      throw errCode(new Error('a valid ttl must be provided (bigger than 120)'), errCodes.INVALID_TTL)
    }

    const addrs = []
    for (const m of this._libp2p.multiaddrs) {
      if (!multiaddr.isMultiaddr(m)) {
        throw errCode(new Error('one or more of the provided multiaddrs is not valid'), errCodes.INVALID_MULTIADDRS)
      }

      addrs.push(m.buffer)
    }

    // Are there available rendezvous servers?
    if (!this._rendezvousConns.size) {
      throw errCode(new Error('no rendezvous servers connected'), errCodes.NO_CONNECTED_RENDEZVOUS_SERVERS)
    }

    const message = Message.encode({
      type: MESSAGE_TYPE.REGISTER,
      register: {
        peer: {
          id: this._peerId.toBytes(),
          addrs
        },
        ns,
        ttl // TODO: convert to seconds
      }
    })

    const registerTasks = []
    const taskFn = async (id) => {
      const conn = this._rendezvousConns.get(id)
      const { stream } = await conn.newStream(PROTOCOL_MULTICODEC)

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

      return recMessage.registerResponse.ttl
    }

    for (const id of this._rendezvousConns.keys()) {
      registerTasks.push(taskFn(id))
    }

    // Return first ttl
    const [returnTtl] = await Promise.all(registerTasks)
    return returnTtl
  }

  /**
   * Unregister peer from the nampesapce.
   * @param {string} ns
   * @returns {Promise<void>}
   */
  async unregister (ns) {
    if (!ns) {
      throw errCode(new Error('a namespace must be provided'), errCodes.INVALID_NAMESPACE)
    }

    // Are there available rendezvous servers?
    if (!this._rendezvousConns.size) {
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
      const conn = this._rendezvousConns.get(id)
      const { stream } = await conn.newStream(PROTOCOL_MULTICODEC)

      await pipe(
        [message],
        lp.encode(),
        stream,
        async (source) => {
          for await (const _ of source) { } // eslint-disable-line
        }
      )
    }

    for (const id of this._rendezvousConns.keys()) {
      unregisterTasks.push(taskFn(id))
    }

    await Promise.all(unregisterTasks)
  }

  /**
   * Discover peers registered under a given namespace
   * @param {string} ns
   * @param {number} [limit]
   * @param {Buffer} [cookie]
   * @returns {AsyncIterable<{ id: PeerId, multiaddrs: Array<Multiaddr>, ns: string, ttl: number }>}
   */
  async * discover (ns, limit, cookie) {
    // Are there available rendezvous servers?
    if (!this._rendezvousConns.size) {
      throw errCode(new Error('no rendezvous servers connected'), errCodes.NO_CONNECTED_RENDEZVOUS_SERVERS)
    }

    const registrationTransformer = (r) => ({
      id: PeerId.createFromBytes(r.peer.id),
      multiaddrs: r.peer.addrs && r.peer.addrs.map((a) => multiaddr(a)),
      ns: r.ns,
      ttl: r.ttl
    })

    // Local search if Server
    if (this._server) {
      const localRegistrations = this._server.getRegistrations(ns, limit)
      for (const r of localRegistrations) {
        yield registrationTransformer(r)

        limit--
        if (limit === 0) {
          return
        }
      }
    }

    const message = Message.encode({
      type: MESSAGE_TYPE.DISCOVER,
      discover: {
        ns,
        limit,
        cookie
      }
    })

    for (const id of this._rendezvousConns.keys()) {
      const conn = this._rendezvousConns.get(id)
      const { stream } = await conn.newStream(PROTOCOL_MULTICODEC)

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
      }

      for (const r of recMessage.discoverResponse.registrations) {
        // track registrations and check if already provided
        yield registrationTransformer(r)

        limit--
        if (limit === 0) {
          return
        }
      }
    }
  }
}

Rendezvous.tag = 'rendezvous'
module.exports = Rendezvous
