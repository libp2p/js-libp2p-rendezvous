'use strict'

const Libp2p = require('libp2p')
const { MULTIADDRS_WEBSOCKETS } = require('./test/fixtures/browser')
const Peers = require('./test/fixtures/peers')
const PeerId = require('peer-id')
const WebSockets = require('libp2p-websockets')
const Muxer = require('libp2p-mplex')
const { NOISE: Crypto } = require('libp2p-noise')

let libp2p

const before = async () => {
  // Use the last peer
  const peerId = await PeerId.createFromJSON(Peers[Peers.length - 1])

  libp2p = new Libp2p({
    addresses: {
      listen: [MULTIADDRS_WEBSOCKETS[0]]
    },
    peerId,
    modules: {
      transport: [WebSockets],
      streamMuxer: [Muxer],
      connEncryption: [Crypto]
    },
    config: {
      relay: {
        enabled: true,
        hop: {
          enabled: true,
          active: false
        }
      }
    }
  })
  
  await libp2p.start()
}

const after = async () => {
  await libp2p.stop()
}

module.exports = {
  bundlesize: { maxSize: '100kB' },
  hooks: {
    pre: before,
    post: after
  },
  webpack: {
    node: {
      // this is needed until bcrypto stops using node buffers in browser code
      Buffer: true
    }
  }
}
