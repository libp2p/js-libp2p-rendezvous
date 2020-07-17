
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
      const options = {
        cookie: msg.discover.cookie ? msg.discover.cookie.toString() : undefined,
        limit: msg.discover.limit
      }
      const { registrations, cookie } = rendezvousPoint.getRegistrations(msg.discover.ns, options)

      return {
        type: MESSAGE_TYPE.DISCOVER_RESPONSE,
        discoverResponse: {
          cookie: Buffer.from(cookie),
          registrations: registrations.map((r) => ({
            ns: msg.discover.ns,
            peer: {
              id: r.peerId.toBytes(),
              addrs: r.addrs
            },
            ttl: (r.expiration - Date.now()) * 1e-3 // convert to seconds
          })),
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
