
'use strict'

const debug = require('debug')
const log = debug('libp2p:redezvous:protocol:discover')
log.error = debug('libp2p:redezvous:protocol:discover:error')

const { Message } = require('../../../proto')
const MESSAGE_TYPE = Message.MessageType
const RESPONSE_STATUS = Message.ResponseStatus

const { MAX_NS_LENGTH, MAX_LIMIT } = require('../../../constants')

module.exports = (rendezvousPoint) => {
  /**
   * Process `Discover` Rendezvous messages.
   *
   * @param {PeerId} peerId
   * @param {Message} msg
   * @returns {Message}
   */
  return function discover (peerId, msg) {
    try {
      log(`discover ${peerId.toB58String()}: discover on ${msg.discover.ns}`)

      // Validate namespace
      if (!msg.discover.ns || msg.discover.ns > MAX_NS_LENGTH) {
        log.error(`invalid namespace received: ${msg.discover.ns}`)

        return {
          type: MESSAGE_TYPE.DISCOVER_RESPONSE,
          discoverResponse: {
            status: RESPONSE_STATUS.E_INVALID_NAMESPACE
          }
        }
      }

      if (!msg.discover.limit || msg.discover.limit <= 0 || msg.discover.limit > MAX_LIMIT) {
        msg.discover.limit = MAX_LIMIT
      }

      // Get registrations
      const registrations = rendezvousPoint.getRegistrations(msg.discover.ns, msg.discover.limit)

      return {
        type: MESSAGE_TYPE.DISCOVER_RESPONSE,
        discoverResponse: {
          cookie: undefined, // TODO
          registrations,
          status: RESPONSE_STATUS.OK
        }
      }
    } catch (err) {
      log.error(err)
    }

    return {
      type: MESSAGE_TYPE.REGISTER_RESPONSE,
      discoverResponse: {
        status: RESPONSE_STATUS.E_INTERNAL_ERROR
      }
    }
  }
}
