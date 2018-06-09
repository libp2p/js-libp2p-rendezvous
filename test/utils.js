'use strict'

const Libp2p = require('libp2p')
const Id = require('peer-id')
const Peer = require('peer-info')

const WS = require('libp2p-websockets')
const MPLEX = require('libp2p-mplex')
const SECIO = require('libp2p-secio')

const defaultAddrs = ['/ip4/127.0.0.1/tcp/0/ws']
const defaultServerAddrs = ['/ip4/127.0.0.1/tcp/5334/ws']
const Server = require('../src/server')

const U = module.exports = {
  createSwarm: (id, addrs) => new Promise((resolve, reject) => {
    Id.createFromJSON(id, (err, peerID) => {
      if (err) return reject(err)
      const peer = new Peer(peerID)
      if (!addrs) defaultAddrs = addrs
      defaultAddrs.forEach(a => peer.multiaddrs.add(a))

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
      }, peer, null, {})
      // swarm.modules.discovery = [new HackDiscovery(swarm)]
      swarm.start(err => {
        if (err) return reject(err)
        resolve(swarm)
      })
    })
  }),
  createServer: async (id, conf, addrs) => {
    const swarm = await U.createSwarm(id, addrs || defaultServerAddrs)
    const server = new Server(Object.assign(Object.assign({}, conf || {}), {swarm}))
    server.start()
    return server
  }
}
