
'use strict'

const debug = require('debug')
const log = debug('libp2p:rendezvous:protocol:unregister')
log.error = debug('libp2p:rendezvous:protocol:unregister:error')

const equals = require('uint8arrays/equals')

module.exports = (rendezvousPoint) => {
  /**
   * Process `Unregister` Rendezvous messages.
   *
   * @param {PeerId} peerId
   * @param {Message} msg
   */
  return function unregister (peerId, msg) {
    try {
      log(`unregister ${peerId.toB58String()}: trying unregister from ${msg.unregister.ns}`)

      if (!msg.unregister.id && !msg.unregister.ns) {
        throw new Error('no peerId or namespace provided')
      }

      // Validate auth
      if (!equals(msg.unregister.id, peerId.toBytes())) {
        log.error('unauthorized peer id to unregister')

        return
      }

      // Remove registration
      if (!msg.unregister.ns) {
        rendezvousPoint.removePeerRegistrations(peerId)
      } else {
        rendezvousPoint.removeRegistration(msg.unregister.ns, peerId)
      }
    } catch (err) {
      log.error(err)
    }
  }
}
