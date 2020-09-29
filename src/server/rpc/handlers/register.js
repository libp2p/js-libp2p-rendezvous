
'use strict'

const debug = require('debug')
const log = debug('libp2p:rendezvous:protocol:register')
log.error = debug('libp2p:rendezvous:protocol:register:error')

const Envelope = require('libp2p/src/record/envelope')
const PeerRecord = require('libp2p/src/record/peer-record')

const { Message } = require('../../../proto')
const MESSAGE_TYPE = Message.MessageType
const RESPONSE_STATUS = Message.ResponseStatus

const { MAX_NS_LENGTH } = require('../../../constants')

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
      log(`register ${peerId.toB58String()}: trying register on ${msg.register.ns}`)

      // Validate namespace
      if (!msg.register.ns || msg.register.ns > MAX_NS_LENGTH) {
        log.error(`invalid namespace received: ${msg.register.ns}`)

        return {
          type: MESSAGE_TYPE.REGISTER_RESPONSE,
          registerResponse: {
            status: RESPONSE_STATUS.E_INVALID_NAMESPACE
          }
        }
      }

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
        msg.register.ns,
        peerId,
        envelope,
        msg.register.ttl * 1e3 // convert to ms
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
