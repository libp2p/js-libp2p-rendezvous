
'use strict'

const debug = require('debug')
const log = Object.assign(debug('libp2p:rendezvous-server:rpc:unregister'), {
  error: debug('libp2p:rendezvous-server:rpc:unregister:err')
})

const equals = require('uint8arrays/equals')

/**
 * @typedef {import('peer-id')} PeerId
 * @typedef {import('../..')} RendezvousPoint
 */

/**
 * @param {RendezvousPoint} rendezvousPoint
 */
module.exports = (rendezvousPoint) => {
  /**
   * Process `Unregister` Rendezvous messages.
   *
   * @param {PeerId} peerId
   * @param {Message} msg
   * @returns {Promise<void>}
   */
  return async function unregister (peerId, msg) {
    try {
      log(`unregister ${peerId.toB58String()}: trying unregister from ${msg.unregister.ns}`)

      if (!msg.unregister.id && !msg.unregister.ns) {
        log.error('no peerId or namespace provided')
        return
      }

      // Validate auth
      if (!equals(msg.unregister.id, peerId.toBytes())) {
        log.error('unauthorized peer id to unregister')
        return
      }

      // Remove registration
      if (!msg.unregister.ns) {
        await rendezvousPoint.removePeerRegistrations(peerId)
      } else {
        await rendezvousPoint.removeRegistration(msg.unregister.ns, peerId)
      }
    } catch (err) {
      log.error(err)
    }
  }
}
