
'use strict'

const debug = require('debug')
const log = debug('libp2p:redezvous:protocol:unregister')
log.error = debug('libp2p:redezvous:protocol:unregister:error')

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
      if (!msg.unregister.id.equals(peerId.toBytes())) {
        log.error('unauthorized peer id to unregister')

        // TODO: auth validation of peerId? -- there is no answer
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
    // TODO: internal error? -- there is no answer
  }
}
