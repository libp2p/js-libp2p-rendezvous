
'use strict'

const debug = require('debug')
const log = Object.assign(debug('libp2p:rendezvous-server:rpc:discover'), {
  error: debug('libp2p:rendezvous-server:rpc:discover:err')
})

const fromString = require('uint8arrays/from-string')
const toString = require('uint8arrays/to-string')

const { Message } = require('../../../proto')
const MESSAGE_TYPE = Message.MessageType
const RESPONSE_STATUS = Message.ResponseStatus

const { codes: errCodes } = require('../../errors')

/**
 * @typedef {import('peer-id')} PeerId
 * @typedef {import('../..')} RendezvousPoint
 */

/**
 * @param {RendezvousPoint} rendezvousPoint
 */
module.exports = (rendezvousPoint) => {
  /**
   * Process `Discover` Rendezvous messages.
   *
   * @param {PeerId} peerId
   * @param {Message} msg
   * @returns {Promise<Message>}
   */
  return async function discover (peerId, msg) {
    try {
      const namespace = msg.discover.ns
      log(`discover ${peerId.toB58String()}: discover on ${namespace}`)

      // Validate namespace
      if (!namespace || namespace.length > rendezvousPoint._maxNsLength) {
        log.error(`invalid namespace received: ${namespace}`)

        return {
          type: MESSAGE_TYPE.DISCOVER_RESPONSE,
          discoverResponse: {
            status: RESPONSE_STATUS.E_INVALID_NAMESPACE,
            statusText: `invalid namespace received: "${namespace}". It should be smaller than ${rendezvousPoint._maxNsLength}`
          }
        }
      }

      if (!msg.discover.limit || msg.discover.limit <= 0 || msg.discover.limit > rendezvousPoint._maxDiscoveryLimit) {
        msg.discover.limit = rendezvousPoint._maxDiscoveryLimit
      }

      // Get registrations
      const options = {
        cookie: msg.discover.cookie ? toString(msg.discover.cookie) : undefined,
        limit: msg.discover.limit
      }

      const { registrations, cookie } = await rendezvousPoint.getRegistrations(namespace, options)

      return {
        type: MESSAGE_TYPE.DISCOVER_RESPONSE,
        discoverResponse: {
          cookie: fromString(cookie),
          registrations: registrations.map((r) => ({
            ns: r.ns,
            signedPeerRecord: r.signedPeerRecord,
            ttl: r.ttl * 1e-3 // convert to seconds
          })),
          status: RESPONSE_STATUS.OK
        }
      }
    } catch (err) {
      log.error(err)

      if (err.code === errCodes.INVALID_COOKIE) {
        return {
          type: MESSAGE_TYPE.DISCOVER_RESPONSE,
          discoverResponse: {
            status: RESPONSE_STATUS.E_INVALID_COOKIE,
            statusText: `invalid cookie received: "${toString(msg.discover.cookie)}"`
          }
        }
      }
    }

    return {
      type: MESSAGE_TYPE.REGISTER_RESPONSE,
      discoverResponse: {
        status: RESPONSE_STATUS.E_INTERNAL_ERROR
      }
    }
  }
}
