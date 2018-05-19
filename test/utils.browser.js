'use strict'

const Libp2p = require('libp2p')
const WS = require('libp2p-websockets')
const MPLEX = require('libp2p-mplex')
const SPDY = require('libp2p-spdy')
const SECIO = require('libp2p-secio')

const Id = require('peer-id')
const Peer = require('peer-info')

const Client = require('../src')

const Utils = module.exports = (id, addrs, cb) => {
  Id.createFromJSON(id, (err, id) => {
    if (err) return cb(err)
    const peer = new Peer(id)
    addrs.forEach(a => peer.multiaddrs.add(a))

    const swarm = new Libp2p({
      transport: [
        new WS()
      ],
      connection: {
        muxer: [
          MPLEX,
          SPDY
        ],
        crypto: [SECIO]
      }
    }, peer, null, {
      relay: {
        enabled: true,
        hop: {
          enabled: true,
          active: false
        }
      }
    })

    swarm.start(err => {
      if (err) return cb(err)
      cb(null, swarm)
    })
  })
}

Utils.id = (id, addrs, cb) => {
  Id.createFromJSON(id, (err, id) => {
    if (err) return cb(err)
    const peer = new Peer(id)
    addrs.forEach(a => peer.multiaddrs.add(a))
    cb(null, peer)
  })
}

Utils.createServerMock = (id, addrs, cb) => {
  Utils.id(id, addrs, (err, peerInfo) => {
    if (err) return cb(err)
    let swarm = {peerInfo}
    let server = {node: swarm}
    return cb(null, server, swarm)
  })
}

Utils.createClient = (id, addrs, cb) => {
  Utils(id, addrs, (err, swarm) => {
    if (err) return cb(err)
    const client = new Client(swarm)
    client.start(err => {
      if (err) return cb(err)
      return cb(null, client, swarm)
    })
  })
}

Utils.default = cb => Utils.createServerMock(require('./server.id.json'), ['/ip4/127.0.0.1/tcp/3236/ws'], (err, server) => {
  if (err) return cb(err)
  Utils.createClient(require('./client.id.json'), [], (err, client) => {
    if (err) return cb(err)
    Utils.createClient(require('./client2.id.json'), [], (err, client2) => {
      if (err) return cb(err)
      return cb(null, client, server, client2)
    })
  })
})
