'use strict'

const debug = require('debug')
const log = debug('libp2p:redezvous-point:rpc')
log.error = debug('libp2p:redezvous-point:rpc:error')

const pipe = require('it-pipe')
const lp = require('it-length-prefixed')
const { toBuffer } = require('it-buffer')

const handlers = require('./handlers')
const { Message } = require('../../proto')

module.exports = (rendezvous) => {
  const getMessageHandler = handlers(rendezvous)

  /**
  * Process incoming Rendezvous messages.
  * @param {PeerId} peerId
  * @param {Message} msg
  * @returns {Promise<Message>}
  */
  function handleMessage (peerId, msg) {
    const handler = getMessageHandler(msg.type)

    if (!handler) {
      log.error(`no handler found for message type: ${msg.type}`)
      return
    }

    return handler(peerId, msg)
  }

  /**
   * Handle incoming streams on the rendezvous protocol.
   * @param {Object} props
   * @param {DuplexStream} props.stream
   * @param {Connection} props.connection connection
   * @returns {Promise<void>}
   */
  return async function onIncomingStream ({ stream, connection }) {
    const peerId = connection.remotePeer

    log('incoming stream from: %s', peerId.toB58String())

    await pipe(
      stream.source,
      lp.decode(),
      toBuffer,
      source => (async function * () {
        for await (const msg of source) {
          // handle the message
          const desMessage = Message.decode(msg)
          const res = await handleMessage(peerId, desMessage)

          if (res) {
            yield Message.encode(res)
          }
        }
      })(),
      lp.encode(),
      stream.sink
    )
  }
}
