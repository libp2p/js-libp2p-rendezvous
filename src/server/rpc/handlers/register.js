
'use strict'

const debug = require('debug')
const log = debug('libp2p:rendezvous:protocol:register')
log.error = debug('libp2p:rendezvous:protocol:register:error')

const Envelope = require('libp2p/src/record/envelope')
const PeerRecord = require('libp2p/src/record/peer-record')

const { Message } = require('../../../proto')
const MESSAGE_TYPE = Message.MessageType
const RESPONSE_STATUS = Message.ResponseStatus

/**
 * @typedef {import('peer-id')} PeerId
 * @typedef {import('../..')} RendezvousPoint
 */

/**
 * @param {RendezvousPoint} rendezvousPoint
 */
module.exports = (rendezvousPoint) => {
  /**
   * Process `Register` Rendezvous messages.
   *
   * @param {PeerId} peerId
   * @param {Message} msg
   * @returns {Promise<Message>}
   */
  return async function register (peerId, msg) {
    try {
      const namespace = msg.register.ns

      // Validate namespace
      if (!namespace || namespace.length > rendezvousPoint._maxNsLength) {
        log.error(`invalid namespace received: ${namespace}`)

        return {
          type: MESSAGE_TYPE.REGISTER_RESPONSE,
          registerResponse: {
            status: RESPONSE_STATUS.E_INVALID_NAMESPACE,
            statusText: `invalid namespace received: "${namespace}". It should be smaller than ${rendezvousPoint._maxNsLength}`
          }
        }
      }

      // Validate ttl
      const ttl = msg.register.ttl * 1e3 // convert to ms
      if (!ttl || ttl < rendezvousPoint._minTtl || ttl > rendezvousPoint._maxTtl) {
        log.error(`invalid ttl received: ${ttl}`)

        return {
          type: MESSAGE_TYPE.REGISTER_RESPONSE,
          registerResponse: {
            status: RESPONSE_STATUS.E_INVALID_TTL,
            statusText: `invalid ttl received: "${ttl}". It should be bigger than ${rendezvousPoint._minTtl} and smaller than ${rendezvousPoint._maxTtl}`
          }
        }
      }

      log(`register ${peerId.toB58String()}: trying register on ${namespace} by ${ttl} ms`)

      // Open and verify envelope signature
      const envelope = await Envelope.openAndCertify(msg.register.signedPeerRecord, PeerRecord.DOMAIN)

      // Validate auth
      if (!envelope.peerId.equals(peerId.toBytes())) {
        log.error('unauthorized peer id to register')

        return {
          type: MESSAGE_TYPE.REGISTER_RESPONSE,
          registerResponse: {
            status: RESPONSE_STATUS.E_NOT_AUTHORIZED
          }
        }
      }

      // Add registration
      rendezvousPoint.addRegistration(
        namespace,
        peerId,
        envelope,
        ttl
      )

      return {
        type: MESSAGE_TYPE.REGISTER_RESPONSE,
        registerResponse: {
          status: RESPONSE_STATUS.OK,
          ttl: msg.register.ttl
        }
      }
    } catch (err) {
      log.error(err)
    }

    return {
      type: MESSAGE_TYPE.REGISTER_RESPONSE,
      registerResponse: {
        status: RESPONSE_STATUS.E_INTERNAL_ERROR
      }
    }
  }
}
