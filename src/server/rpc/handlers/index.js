'use strict'

const { Message } = require('../../../proto')
const MESSAGE_TYPE = Message.MessageType

module.exports = (server) => {
  const handlers = {
    [MESSAGE_TYPE.REGISTER]: require('./register')(server),
    [MESSAGE_TYPE.UNREGISTER]: require('./unregister')(server),
    [MESSAGE_TYPE.DISCOVER]: require('./discover')(server)
  }

  /**
   * Get the message handler matching the passed in type.
   * @param {number} type
   * @returns {function(PeerId, Message, function(Error, Message))}
   */
  return function getMessageHandler (type) {
    return handlers[type]
  }
}
