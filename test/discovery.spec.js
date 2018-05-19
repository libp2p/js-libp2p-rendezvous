'use strict'

/* eslint-env mocha */

const {parallel} = require('async')
const Utils = require('./utils')
const pull = require('pull-stream')
const proto = require('../src/proto')

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)

const startPromise = (node) => new Promise((resolve, reject) => {
  node.start((err) => {
    if (err) return reject(err)
    resolve()
  })
})

// const dialPromise = () => new Promise(() => {
// })

describe('interface-peer-discovery', () => {
  // it('Client can register for point', async () => {
  //   const point = await Utils.createRendezvousPeer(require('./server.id.json'))
  //   console.log('Point created')
  //   const client1 = await Utils.createRendezvousPeer(require('./client.id.json'))
  //   console.log('Client1 created')
  // })

  it.only('discovers peers', async () => {
    const point = await Utils.createRendezvousPeer(require('./server.id.json'))
    const client1 = await Utils.createRendezvousPeer(require('./client.id.json'))
    const client2 = await Utils.createRendezvousPeer(require('./client2.id.json'))

    await startPromise(point)
    await startPromise(client1)
    await startPromise(client2)

    // First connect client1
    // Then listen for new peers on client2
    // Then connect client2

    const gotPeerPromise = new Promise((resolve, reject) => {
      client2.once('peer', (peer) => {
        if (peer.id === client1.id) {
          resolve()
        } else {
          reject(new Error('Got wrong peer'))
        }
      })
    })
    client1.switch.dial(point.peerInfo, '/p2p/rendezvous/1.0.0', (err, conn) => {
      if (err) throw err
      // Construct the register message
      console.log('outgoing peerInfo', client1.peerInfo)
      const msg = proto.Message.encode({
        type: proto.MessageType.REGISTER,
        register: {
          ns: 'my-app',
          ttl: 60,
          peer: {
            id: client1.peerInfo.id._id,
            addrs: client1.peerInfo.multiaddrs.toArray().map((ma) => {
              return ma.buffer
            })
          }
        }
      })
      pull(pull.values([msg]), conn, pull.collect((err, msg) => {
        if (err) throw err
        // This is the response from the dial
        console.log(msg.toString())
      }))
    })
    return gotPeerPromise
    // start
    // once('peer')
    // stop
  })
})

describe.skip('discovery', () => {
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
