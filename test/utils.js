'use strict'

const Transport = require('libp2p-websockets')
const Muxer = require('libp2p-mplex')
const { NOISE: Crypto } = require('libp2p-noise')
const PeerId = require('peer-id')

const pTimes = require('p-times')
const pWaitFor = require('p-wait-for')

const Libp2p = require('libp2p')
const multiaddr = require('multiaddr')
const Envelope = require('libp2p/src/record/envelope')
const PeerRecord = require('libp2p/src/record/peer-record')

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
 * Create Perr Id.
 * @param {Object} [properties]
 * @param {number} [properties.number] number of peers (default: 1).
 * @return {Promise<Array<PeerId>>}
 */
async function createPeerId ({ number = 1 }) {
  const peerIds = await pTimes(number, (i) => PeerId.createFromJSON(Peers[i]))

  return peerIds
}

module.exports.createPeerId = createPeerId

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
  await pWaitFor(() => peer.rendezvous._rendezvousPoints.size === 1)
}

module.exports.connectPeers = connectPeers

async function createSignedPeerRecord (peerId, multiaddrs) {
  const pr = new PeerRecord({
    peerId,
    multiaddrs
  })

  const envelope = await Envelope.seal(pr, peerId)

  return envelope
}

module.exports.createSignedPeerRecord = createSignedPeerRecord