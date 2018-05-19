'use strict'

const Utils = require('./test/utils')

let Server

function pre (done) {
  Utils.createServer(require('./test/server.id.json'), ['/ip4/127.0.0.1/tcp/3236/ws'], {}, (err, server) => {
    if (err) return done(err)
    Server = server
    done()
  })
}

function post (done) {
  Server.stop(done)
}

module.exports = {
  hooks: {
    pre,
    post
  }
}
