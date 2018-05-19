'use strict'

const Libp2p = require('libp2p')
const TCP = require('libp2p-tcp')
const WS = require('libp2p-websockets')
const MPLEX = require('libp2p-mplex')
const SECIO = require('libp2p-secio')
const PeerID = require('peer-id')
const PeerInfo = require('peer-info')
const EE = require('events').EventEmitter
const pull = require('pull-stream')

const defaultAddrs = ['/ip4/127.0.0.1/tcp/0/ws']

const proto = require('../src/proto')

const {
  createStore
  // createNamespace
  // utils,
  // addPeer,
  // removePeer,
  // clearExpired
} = require('../src/server/store/immutable')

const decodePeerInfoFromMessage = (msg) => {
  const peerInfo = new PeerInfo(PeerID.createFromBytes(msg.register.peer.id))
  msg.register.peer.addrs.forEach(ma => {
    peerInfo.multiaddrs.add(ma)
  })
  return peerInfo
}

const handlers = {
  [proto.MessageType.REGISTER]: (store, conn, msg, callback) => {
    console.log('should add namespace?')
    console.log('incoming peerInfo', decodePeerInfoFromMessage(msg))
    callback(null, store)
  }
}

class HackDiscovery {
  constructor (swarm) {
    this.swarm = swarm
    this.discoveryInterface = new EE()
    this.store = createStore()
  }
  start (callback) {
    // When starting, start to handle the protocol
    // Also start listening for incoming connections, and when that happens, try to connect to rendezvous
    this.swarm.handle('/p2p/rendezvous/1.0.0', (protocol, conn) => {
      // console.log('protocol', protocol)
      // console.log('conn', conn)
      // conn.getPeerInfo((err, pi) => {
      //   // console.log('pi', pi)
      // })
      pull(conn, pull.collect((err, msg) => {
        if (err) throw err
        // console.log('handle', err, msg)
        // Here is the message we received from a peer
        // Add switch statement on what to handle here
        const decodedMessage = proto.Message.decode(msg[0])
        // console.log(decodedMessage)
        if (handlers[decodedMessage.type]) {
          // Need to respond with a success message here
          handlers[decodedMessage.type](this.store, conn, decodedMessage, (err, store) => {
            if (err) throw err
            this.store = store
          })
        } else {
          throw new Error('Received a message whose `type` we dont recognize')
        }
        if (msg.toString() === 'ping') {
          pull(pull.values(['pong']), conn)
        }
      }, conn))
    })
    // this.swarm.on('peer-mux-established', (peer) => {
    //   console.log('found a peer', peer)
    // })
    setImmediate(callback)
  }
  stop (callback) {
    setImmediate(callback)
  }
  emit (peerInfo) {
    this.discoveryInterface('peer', peerInfo)
  }
}
// const withIs = require('class-is')
// HackDiscovery = withIs(HackDiscovery, { className: 'HackDiscovery', symbolName: '@libp2p/js-libp2p-rendezvous' })

module.exports = {
  createRendezvousPeer: (id) => new Promise((resolve, reject) => {
    PeerID.createFromJSON(id, (err, peerID) => {
      if (err) return reject(err)
      const peer = new PeerInfo(peerID)
      defaultAddrs.forEach(a => peer.multiaddrs.add(a))

      const swarm = new Libp2p({
        transport: [
          new WS()
        ],
        // discovery: [new HackDiscovery()],
        connection: {
          muxer: [
            MPLEX
          ],
          crypto: [SECIO]
        }
      }, peer, null, {})
      swarm.modules.discovery = [new HackDiscovery(swarm)]
      // swarm.handle('/rendezvous/1.0.0', (gotConn) => {
      //   console.log('got conn', gotConn)
      // })
      resolve(swarm)
      // swarm.start(err => {
      //   if (err) return reject(err)
      //   resolve(swarm)
      // })
    })
  })
}

/*
const SPDY = require('libp2p-spdy')

const Server = require('../src/server')
const Client = require('../src')

const Utils = module.exports = (id, addrs, cb) => {
  Id.createFromJSON(id, (err, id) => {
    if (err) return cb(err)
    const peer = new Peer(id)
    addrs.forEach(a => peer.multiaddrs.add(a))

    const swarm = new Libp2p({
      transport: [
        new TCP(),
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

Utils.default = cb => Utils.createServer(require('./server.id.json'), ['/ip4/0.0.0.0/tcp/0'], {}, (err, server) => {
  if (err) return cb(err)
  Utils.createClient(require('./client.id.json'), ['/ip4/0.0.0.0/tcp/0'], (err, client) => {
    if (err) return cb(err)
    Utils.createClient(require('./client2.id.json'), ['/ip4/0.0.0.0/tcp/0'], (err, client2) => {
      if (err) return cb(err)
      return cb(null, client, server, client2)
    })
  })
})
*/
