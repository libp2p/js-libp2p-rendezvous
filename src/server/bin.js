#!/usr/bin/env node

'use strict'

// Usage: $0 [--peerId <jsonFilePath>] [--listenMultiaddrs <ma> ... <ma>] [--announceMultiaddrs <ma> ... <ma>] [--metricsMultiaddr <ma>] [--disableMetrics]

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

const multiaddr = require('multiaddr')
const PeerId = require('peer-id')

const RendezvousServer = require('./index')
const { getAnnounceAddresses, getListenAddresses } = require('./utils')

async function main () {
  // Metrics
  let metricsServer
  const metrics = !(argv.disableMetrics || process.env.DISABLE_METRICS)
  const metricsMa = multiaddr(argv.metricsMultiaddr || argv.ma || process.env.METRICSMA || '/ip4/127.0.0.1/tcp/8003')
  const metricsAddr = metricsMa.nodeAddress()

  // Multiaddrs
  const listenAddresses = getListenAddresses(argv)
  const announceAddresses = getAnnounceAddresses(argv)

  // PeerId
  let peerId
  if (argv.peerId) {
    const peerData = fs.readFileSync(argv.peerId)
    peerId = await PeerId.createFromJSON(JSON.parse(peerData))
  } else {
    peerId = await PeerId.create()
    log('You are using an automatically generated peer.')
    log('If you want to keep the same address for the server you should provide a peerId with --peerId <jsonFilePath>')
  }

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
  })

  await rendezvousServer.start()

  if (metrics) {
    log('enabling metrics')
    metricsServer = http.createServer((req, res) => {
      if (req.url !== '/metrics') {
        res.statusCode = 200
        res.end()
      }
    })

    menoetius.instrument(metricsServer)

    metricsServer.listen(metricsAddr.port, metricsAddr.address, () => {
      console.log(`metrics server listening on ${metricsAddr.port}`)
    })
  }

  const stop = async () => {
    console.log('Stopping...', rendezvousServer.multiaddrs)
    await rendezvousServer.stop()
    metricsServer && await metricsServer.close()
    process.exit(0)
  }

  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

main()
