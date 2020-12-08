#!/usr/bin/env node

'use strict'

// Usage: $0 [--peerId <jsonFilePath>] [--listenMultiaddrs <ma> ... <ma>] [--announceMultiaddrs <ma> ... <ma>] [--metricsPort <port>] [--disableMetrics]

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
const Datastore = require('./datastores/memory')
const { getAnnounceAddresses, getListenAddresses } = require('./utils')

async function main () {
  // Metrics
  let metricsServer
  const metrics = !(argv.disableMetrics || process.env.DISABLE_METRICS)
  const metricsPort = argv.metricsPort || argv.mp || process.env.METRICS_PORT || '8003'
  // const metricsMa = multiaddr(argv.metricsMultiaddr || argv.ma || process.env.METRICSMA || '/ip4/127.0.0.1/tcp/8003')
  // const metricsAddr = metricsMa.nodeAddress()

  // Multiaddrs
  const listenAddresses = getListenAddresses(argv)
  const announceAddresses = getAnnounceAddresses(argv)

  // PeerId
  let peerId
  if (argv.peerId) {
    const peerData = fs.readFileSync(argv.peerId)
    peerId = await PeerId.createFromJSON(JSON.parse(peerData.toString()))
  } else {
    peerId = await PeerId.create()
    log('You are using an automatically generated peer.')
    log('If you want to keep the same address for the server you should provide a peerId with --peerId <jsonFilePath>')
  }

  // Create Rendezvous server
  const datastore = new Datastore()
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
  console.log('Rendezvous server listening on:')
  rendezvousServer.multiaddrs.forEach((m) => console.log(m))

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
      console.log(`metrics server listening on ${metricsPort.port}`)
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
