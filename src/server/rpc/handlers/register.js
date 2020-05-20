
'use strict'

const debug = require('debug')
const log = debug('libp2p:redezvous:protocol:register')
log.error = debug('libp2p:redezvous:protocol:register:error')

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
   * @returns {Message}
   */
  return function register (peerId, msg) {
    try {
      log(`register ${peerId.toB58String()}: trying register on ${msg.register.ns}`)

      // Validate auth
      if (!msg.register.peer.id.equals(peerId.toBytes())) {
        log.error('unauthorized peer id to register')

        return {
          type: MESSAGE_TYPE.REGISTER_RESPONSE,
          registerResponse: {
            status: RESPONSE_STATUS.E_NOT_AUTHORIZED
          }
        }
      }

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

      // Add registration
      rendezvousPoint.addRegistration(
        msg.register.ns,
        peerId,
        msg.register.peer.addrs,
        msg.register.ttl
      )

      return {
        type: MESSAGE_TYPE.REGISTER_RESPONSE,
        registerResponse: {
          status: RESPONSE_STATUS.OK,
          ttt: msg.register.ttl
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
