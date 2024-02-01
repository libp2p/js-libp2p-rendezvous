'use strict'

const Libp2p = require('libp2p')
const Id = require('peer-id')
const Peer = require('peer-info')
const promisify = require('promisify-es6')

const WS = require('libp2p-websockets')
const MPLEX = require('libp2p-mplex')
const SECIO = require('libp2p-secio')

const defaultAddrs = process.toString() === '[object process]' ? ['/ip4/127.0.0.1/tcp/0/ws'] : [] // don't try to create ws-server in browser
const defaultServerAddrs = ['/ip4/127.0.0.1/tcp/5334/ws']
const Rendezvous = require('../src')
const Server = require('../src/server')

const Utils = module.exports = {
  createSwarm: (id, addrs, lp2pOpt, post) => new Promise((resolve, reject) => {
    Id.createFromJSON(id, (err, peerID) => {
      if (err) return reject(err)
      const peer = new Peer(peerID)
      addrs.forEach(a => peer.multiaddrs.add(a))

      const swarm = new Libp2p({
        transport: [
          new WS()
        ],
        connection: {
          muxer: [
            MPLEX
          ],
          crypto: [SECIO]
        }
      }, peer, null, lp2pOpt || {})
      if (post) {
        post(swarm)
      }
      swarm.start(err => {
        if (err) return reject(err)
        resolve(swarm)
      })
    })
  }),
  createServer: async (id, conf, addrs) => {
    const swarm = await Utils.createSwarm(id, addrs || defaultServerAddrs, {
      relay: {
        enabled: true,
        hop: {
          enabled: true,
          active: true
        }
      }
    })
    const server = new Server(Object.assign(Object.assign({}, conf || {}), {swarm}))
    server.start()
    return server
  },
  createRendezvousPeer: async (id, conf, addrs) => {
    let rendezvous
    const swarm = await Utils.createSwarm(id, addrs || defaultAddrs, {
      relay: {
        enabled: true
      }
    }, (swarm) => {
      rendezvous = new Rendezvous(swarm, conf || {})
    })
    rendezvous.start()
    await promisify(swarm.dial.bind(swarm, await Utils.createServerPeerInfo()))()
    await new Promise((resolve) => setTimeout(() => resolve(), 500))
    return rendezvous
  },
  createServerPeerInfo: async () => {
    const peer = new Peer(await promisify(Id.createFromJSON)(require('./server.id.json')))
    defaultServerAddrs.forEach(a => peer.multiaddrs.add(a))
    return peer
  }
}
