'use strict'

/* eslint-env mocha */

const {parallel} = require('async')
const Utils = require('./utils')

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)

describe('discovery', () => {
  let client
  let client2
  let server

  before(done => {
    Utils.default((err, _client, _server, _client2) => {
      if (err) return done(err)
      client = _client
      client2 = _client2
      server = _server
      parallel([client, client2].map(c => cb => c._dial(server.node.peerInfo, cb)), done)
    })
  })

  it('register', done => {
    parallel(
      [client, client2].map(c => cb => c.register('hello', c.swarm.peerInfo, cb)),
      (...a) => setTimeout(() => done(...a), 100) // Queue is being processed every 100ms
    )
  })

  it('discover', done => {
    client.discover('hello', (err, res) => {
      if (err) return done(err)
      expect(err).to.not.exist()
      expect(res.peers).to.have.lengthOf(1)
      expect(res.peers[0].id.toB58String()).to.equal(client2.swarm.peerInfo.id.toB58String())
      done()
    })
  })

  it('unregister', done => {
    client2.unregister('hello')
    setTimeout(() => done(), 100) // Queue is being processed every 100ms
  })

  it('discover (after unregister)', done => {
    client.discover('hello', (err, res) => {
      if (err) return done(err)
      expect(err).to.not.exist()
      expect(res.peers).to.have.lengthOf(0)
      done()
    })
  })

  it('unregister other client', done => {
    client.unregister('hello')
    setTimeout(() => done(), 100) // Queue is being processed every 100ms
  })

  it('gc', () => {
    server.gc()
    expect(Object.keys(server.table.NS)).to.have.lengthOf(0)
  })
})
