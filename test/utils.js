'use strict'

const Libp2p = require('libp2p')
const TCP = require('libp2p-tcp')
const MPLEX = require('libp2p-mplex')
const SPDY = require('libp2p-spdy')
const SECIO = require('libp2p-secio')

const Id = require('peer-id')
const Peer = require('peer-info')

const Server = require('../src/server')
const Client = require('../src')

const Utils = module.exports = (id, addrs, cb) => {
  Id.createFromJSON(require(id), (err, id) => {
    if (err) return cb(err)
    const peer = new Peer(id)
    addrs.forEach(a => peer.multiaddrs.add(a))

    const swarm = new Libp2p({
      transport: [
        new TCP()
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
  Id.createFromJSON(require(id), (err, id) => {
    if (err) return cb(err)
    const peer = new Peer(id)
    addrs.forEach(a => peer.multiaddrs.add(a))
    cb(null, peer)
  })
}

Utils.createServer = (id, addrs, opt, cb) => {
  Utils(id, addrs, (err, swarm) => {
    if (err) return cb(err)
    const server = new Server(Object.assign(opt || {}, {node: swarm}))
    server.start()
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

Utils.default = cb => Utils.createServer('./server.id.json', ['/ip4/0.0.0.0/tcp/0'], {}, (err, server) => {
  if (err) return cb(err)
  Utils.createClient('./client.id.json', ['/ip4/0.0.0.0/tcp/0'], (err, client) => {
    if (err) return cb(err)
    Utils.createClient('./client2.id.json', ['/ip4/0.0.0.0/tcp/0'], (err, client2) => {
      if (err) return cb(err)
      return cb(null, client, server, client2)
    })
  })
})
