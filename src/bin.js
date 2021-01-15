#!/usr/bin/env node

'use strict'

// Usage: $0 [--datastoreHost <hostname>] [--datastoreUser <username>] [datastorePassword <password>] [datastoreDatabase <name>] [--enableMemoryDatabase]
//            [--peerId <jsonFilePath>] [--listenMultiaddrs <ma> ... <ma>] [--announceMultiaddrs <ma> ... <ma>] [--metricsPort <port>] [--disableMetrics]

/* eslint-disable no-console */

const debug = require('debug')
const log = debug('libp2p:rendezvous:bin')

const fs = require('fs')
const http = require('http')
const menoetius = require('menoetius')
const argv = require('minimist')(process.argv.slice(2))

const TCP = require('libp2p-tcp')
const Websockets = require('libp2p-websockets')
const Muxer = require('libp2p-mplex')
const { NOISE: Crypto } = require('libp2p-noise')

const PeerId = require('peer-id')

const RendezvousServer = require('./index')
const Datastore = require('./datastores/mysql')
const DatastoreMemory = require('./datastores/memory')
const { getAnnounceAddresses, getListenAddresses } = require('./utils')

async function main () {
  // Datastore
  const memoryDatabase = (argv.enableMemoryDatabase || argv.emd || process.env.DISABLE_METRICS)
  const host = argv.datastoreHost || argv.dh || process.env.DATASTORE_HOST || 'localhost'
  const user = argv.datastoreUser || argv.du || process.env.DATASTORE_USER || 'root'
  const password = argv.datastorePassword || argv.dp || process.env.DATASTORE_PASSWORD || 'test-secret-pw'
  const database = argv.datastoreDatabase || argv.dd || process.env.DATASTORE_DATABASE || 'libp2p_rendezvous_db'

  // Metrics
  let metricsServer
  const metrics = !(argv.disableMetrics || process.env.DISABLE_METRICS)
  const metricsPort = argv.metricsPort || argv.mp || process.env.METRICS_PORT || '8003'

  // Multiaddrs
  const listenAddresses = getListenAddresses(argv)
  const announceAddresses = getAnnounceAddresses(argv)

  // PeerId
  let peerId
  if (argv.peerId || process.env.PEER_ID) {
    const peerData = fs.readFileSync(argv.peerId || process.env.PEER_ID)
    peerId = await PeerId.createFromJSON(JSON.parse(peerData.toString()))
  } else {
    peerId = await PeerId.create()
    log('You are using an automatically generated peer.')
    log('If you want to keep the same address for the server you should provide a peerId with --peerId <jsonFilePath>')
  }

  const datastore = memoryDatabase ? new DatastoreMemory() : new Datastore({
    host,
    user,
    password,
    database
  })

  // Create Rendezvous server
  const rendezvousServer = new RendezvousServer({
    modules: {
      transport: [Websockets, TCP],
      streamMuxer: [Muxer],
      connEncryption: [Crypto]
    },
    peerId,
    addresses: {
      listen: listenAddresses,
      announce: announceAddresses
    }
  }, { datastore })

  await rendezvousServer.start()

  rendezvousServer.peerStore.on('change:multiaddrs', ({ peerId, multiaddrs }) => {
    console.log('Rendezvous server listening on:')
    if (peerId.equals(rendezvousServer.peerId)) {
      multiaddrs.forEach((m) => console.log(`${m}/p2p/${peerId.toB58String()}`))
    }
  })

  if (metrics) {
    log('enabling metrics')
    metricsServer = http.createServer((req, res) => {
      if (req.url !== '/metrics') {
        res.statusCode = 200
        res.end()
      }
    })

    menoetius.instrument(metricsServer)

    metricsServer.listen(metricsPort, '0.0.0.0', () => {
      console.log(`metrics server listening on ${metricsPort}`)
    })
  }

  const stop = async () => {
    console.log('Stopping...')
    await rendezvousServer.stop()
    metricsServer && await metricsServer.close()
    process.exit(0)
  }

  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

main()
