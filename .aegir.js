'use strict'

const Utils = require('./test/utils')

let Server

async function pre (done) {
  Server = await Utils.createServer(require('./test/server.id.json'))
  done()
}

function post (done) {
  Server.stop()
  Server.swarm.stop(done)
}

module.exports = {
  hooks: {
    pre,
    post
  }
}
