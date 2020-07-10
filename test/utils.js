'use strict'

const Transport = require('libp2p-websockets')
const Muxer = require('libp2p-mplex')
const { NOISE: Crypto } = require('libp2p-noise')
const PeerId = require('peer-id')

const pTimes = require('p-times')
const pWaitFor = require('p-wait-for')

const Libp2p = require('libp2p')
const multiaddr = require('multiaddr')

const Peers = require('./fixtures/peers')
const { MULTIADDRS_WEBSOCKETS } = require('./fixtures/browser')
const relayAddr = MULTIADDRS_WEBSOCKETS[0]

const defaultConfig = {
  modules: {
    transport: [Transport],
    streamMuxer: [Muxer],
    connEncryption: [Crypto]
  }
}

/**
 * Create libp2p nodes.
 * @param {Object} [properties]
 * @param {Object} [properties.config]
 * @param {number} [properties.number] number of peers (default: 1).
 * @param {boolean} [properties.started] nodes should start (default: true)
 * @return {Promise<Array<Libp2p>>}
 */
async function createPeer ({ number = 1, started = true, config = {} } = {}) {
  const peerIds = await pTimes(number, (i) => PeerId.createFromJSON(Peers[i]))
  const peers = await pTimes(number, (i) => Libp2p.create({
    peerId: peerIds[i],
    addresses: {
      listen: [multiaddr(`${relayAddr}/p2p-circuit`)]
    },
    ...defaultConfig,
    ...config
  }))

  if (started) {
    await Promise.all(peers.map((p) => p.start()))
  }

  return peers
}

module.exports.createPeer = createPeer

async function connectPeers (peer, otherPeer) {
  // Connect to testing relay node
  await peer.dial(relayAddr)
  await otherPeer.dial(relayAddr)

  // Connect each other via relay node
  const m = multiaddr(`${relayAddr}/p2p-circuit/p2p/${otherPeer.peerId.toB58String()}`)
  await peer.dial(m)

  // Wait event propagation
  await pWaitFor(() => peer.rendezvous._rendezvousConns.size === 1)
}

module.exports.connectPeers = connectPeers
