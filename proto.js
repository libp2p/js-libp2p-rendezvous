const pull = require('pull-stream')
const proto = require('./src/proto.js')

const buf = proto.Message.encode({
  type: proto.MessageType.DISCOVER
})

pull(pull.values([buf]), pull.collect((err, msg) => {
  if (err) throw err
  console.log(proto.Message.decode(msg[0]))
}))
