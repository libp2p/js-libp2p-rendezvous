'use strict'

/* eslint-disable no-console */

const fs = require('fs')
const execa = require('execa')
const argv = require('minimist')(process.argv.slice(2))
const microtime = require('microtime')
const path = require('path')
const pidusage = require('pidusage')
const pDefer = require('p-defer')
const delay = require('delay')
const uint8ArrayToString = require('uint8arrays/to-string')

const { pipe } = require('it-pipe')
const lp = require('it-length-prefixed')
const {
  collect,
  tap
} = require('streaming-iterables')
const { toBuffer } = require('it-buffer')

const Libp2p = require('libp2p')
const PeerId = require('peer-id')

const docker = require('../mysql-local/docker')
const ServerPeerId = require('./id.json')
const { median } = require('./utils')

const {
  PROTOCOL_MULTICODEC
} = require('../src/constants')
const { Message } = require('../src/proto')
const MESSAGE_TYPE = Message.MessageType

const { defaultLibp2pConfig } = require('../test/utils')

/**
 * Setup Rendezvous server process and multiple clients with a connection with the server.
 * Outputs metrics reports on teardown.
 *
 * @param {number} nClients
 * @returns {{ connections: Connection[], clients: Libp2p[], teardown: () => void}}
 */
const setupRendezvous = async (nClients) => {
  // Setup datastore
  console.log('1. Datastore setup')
  const containerId = await docker.start()

  // Setup Server
  console.log('2. Rendezvous Server setup')
  const serverDefer = pDefer()
  // Increase max peer registrations to avoid DoS protection
  const serverProcess = execa('node', [path.join(__dirname, '../src/bin.js'), '--peerId', './id.json', '--maxPeerRegistrations', '1000000'], {
    cwd: path.resolve(__dirname),
    all: true
  })
  serverProcess.all.on('data', (data) => {
    process.stdout.write(data)
    const output = uint8ArrayToString(data)

    if (output.includes('Rendezvous server listening on:')) {
      serverDefer.resolve()
    }
  })

  const serverProcessId = serverProcess.pid

  await serverDefer.promise

  const serverPeerId = await PeerId.createFromJSON(ServerPeerId)
  const serverMultiaddr = `/ip4/127.0.0.1/tcp/15003/ws/p2p/${serverPeerId.toB58String()}`

  const clients = []
  const connections = []

  for (let i = 0; i < nClients; i++) {
    console.log(`3. Rendezvous Client ${i} setup`)

    // Setup Client
    const client = await Libp2p.create({
      ...defaultLibp2pConfig,
      addresses: {
        listen: ['/ip4/127.0.0.1/tcp/0/ws']
      }
    })

    await client.start()
    const connection = await client.dial(serverMultiaddr)

    clients.push(client)
    connections.push(connection)
  }

  return {
    clients,
    connections,
    serverProcessId,
    teardown: async () => {
      serverProcess.kill()

      await Promise.all([
        serverProcess,
        clients.map((client) => client.stop())
      ])

      docker.stop(containerId)
    }
  }
}

// Populate registration in series from each client
const populateRegistrations = async (clients, connections, nRes, nNamespaces) => {
  for (let i = 0; i < nRes; i++) {
    const pIndex = i % clients.length

    const signedPeerRecord = clients[pIndex].peerStore.addressBook.getRawEnvelope(clients[pIndex].peerId)
    const source = [Message.encode({
      type: MESSAGE_TYPE.REGISTER,
      register: {
        signedPeerRecord,
        ns: `${i % nNamespaces}`,
        ttl: 10000
      }
    })]

    const { stream } = await connections[pIndex].newStream(PROTOCOL_MULTICODEC)
    await pipe(
      source,
      lp.encode(),
      stream,
      lp.decode()
    )
  }
}

const createDiscoverMessages = (nRuns, nClients, nNamespaces, limit = 20, discoverInexistentNamespaces = false) => {
  return Array.from({ length: nRuns / nClients }, (_, runIndex) => Message.encode({
    type: MESSAGE_TYPE.DISCOVER,
    discover: {
      ns: discoverInexistentNamespaces ? `${runIndex % nNamespaces}` : `invalid${runIndex % nNamespaces}`,
      limit
    }
  }))
}

const createRegisterMessages = (nRuns, nClients, nNamespaces, signedPeerRecord) => {
  return Array.from({ length: nRuns / nClients }, (_, runIndex) => Message.encode({
    type: MESSAGE_TYPE.REGISTER,
    register: {
      signedPeerRecord,
      ns: `${runIndex % nNamespaces}`,
      ttl: 10000
    }
  }))
}

const sendParallelMessages = async (clients, connections, nRuns, nNamespaces, type = 'REGISTER', discoverLimit, discoverInexistentNamespaces) => {
  let countErrors = 0
  const responseTimes = []

  await Promise.all(Array.from({ length: clients.length }, async (_, i) => {
    const responses = []

    let source
    if (type === 'DISCOVER') {
      source = createDiscoverMessages(nRuns, clients.length, nNamespaces, discoverLimit, discoverInexistentNamespaces)
    } else {
      const signedPeerRecord = clients[i].peerStore.addressBook.getRawEnvelope(clients[i].peerId)
      source = createRegisterMessages(nRuns, clients.length, nNamespaces, signedPeerRecord)
    }

    for (let mIndex = 0; mIndex < source.length; mIndex++) {
      const { stream } = await connections[i].newStream(PROTOCOL_MULTICODEC)

      let start, end
      const r = await pipe(
        [source[mIndex]],
        lp.encode(),
        tap(() => {
          start = microtime.now()
        }),
        stream,
        tap(() => {
          end = microtime.now()
        }),
        lp.decode(),
        toBuffer,
        collect
      )
      responseTimes.push(end - start)
      responses.push(r[0])
    }

    responses.forEach((r) => {
      const m = Message.decode(r)
      if ((m.registerResponse && m.registerResponse.status !== 0) || (m.discoverResponse && m.discoverResponse.status !== 0)) {
        countErrors++
      }
    })
  }))

  return {
    responseTimes,
    countErrors
  }
}

const computePidUsage = (pid) => {
  const measuremennts = []

  const _intervalId = setInterval(() => {
    pidusage(pid, (_, { cpu, memory }) => {
      measuremennts.push({ cpu, memory })
    })
  }, 500)

  return {
    measuremennts,
    teardown: () => clearInterval(_intervalId)
  }
}

const tableHeader = `|   Type   | Clients | Io Reg | Namespaces | Ops | Avg RT | Median RT | Max RT | Avg CPU | Median CPU | Max CPU | Avg Mem | Median Mem | Max Mem |
|----------|---------|--------|------------|-----|--------|-----------|--------|---------|------------|---------|---------|------------|---------|`

// Usage: $0 [--nClients <number>] [--nNamespaces <number>] [--initialRegistrations <number>]
//           [--benchmarkRuns <number>] [--benchmarkType <TYPE>] [--outputFile <path>]
//           [--discoverLimit <number>] [--discoverInexistentNamespaces]
const main = async () => {
  const nClients = argv.nClients || 4
  const nNamespaces = argv.nNamespaces || 5

  const initalRegistrations = argv.initialRegistrations || 100
  const benchmarkRuns = argv.benchmarkRuns || 500
  const benchmarkType = argv.benchmarkType === 'DISCOVER' ? 'DISCOVER' : 'REGISTER'

  const outputPath = argv.outputFile || './output.md'

  const discoverLimit = argv.discoverLimit ? Number(argv.discoverLimit) : 20
  const discoverInexistentNamespaces = argv.discoverInexistentNamespaces

  // Setup datastore, server and clients
  console.log('==========--- Setup ---==========')
  const { clients, connections, serverProcessId, teardown } = await setupRendezvous(nClients)

  // Populate Initial State and prepare data in memory
  console.log('==========--- Initial State Population ---==========')
  await populateRegistrations(clients, connections, initalRegistrations, nNamespaces)

  console.log('==========--- Start Benchmark ---==========')
  const { measuremennts, teardown: pidUsageTeatdown } = computePidUsage(serverProcessId)
  await delay(1000)
  const { responseTimes, countErrors } = await sendParallelMessages(clients, connections, benchmarkRuns, nNamespaces, benchmarkType, discoverLimit, discoverInexistentNamespaces)

  pidUsageTeatdown()
  console.log('==========--- Finished! Compute Metrics ---==========')

  console.log('operations errored', countErrors)

  const averageRT = Math.floor(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / 1000)
  const medianRT = Math.floor(median(responseTimes) / 1000)
  const maxRT = Math.floor(Math.max(...responseTimes) / 1000)

  const cpuM = measuremennts.map((m) => m.cpu)
  const averageCPU = Math.floor(cpuM.reduce((a, b) => a + b, 0) / cpuM.length)
  const medianCPU = Math.floor(median(cpuM))
  const maxCPU = Math.floor(Math.max(...cpuM))

  const memM = measuremennts.map((m) => m.memory)
  const averageMem = Math.floor(memM.reduce((a, b) => a + b, 0) * Math.pow(10, -6) / measuremennts.length)
  const medianMem = Math.floor(median(memM) * Math.pow(10, -6))
  const maxMem = Math.floor(Math.max(...memM) * Math.pow(10, -6))

  const resultString = `| ${benchmarkType} | ${nClients} | ${initalRegistrations} | ${nNamespaces} | ${benchmarkRuns} | ${averageRT} | ${medianRT} | ${maxRT} | ${averageCPU} | ${medianCPU} | ${maxCPU} | ${averageMem} | ${medianMem} | ${maxMem} |`

  console.log(tableHeader)
  console.log(resultString)

  await delay(4000)
  await teardown()

  try {
    if (fs.existsSync(outputPath)) {
      fs.appendFileSync(outputPath, `\n${resultString}`)
    } else {
      fs.appendFileSync(outputPath, `${tableHeader}\n${resultString}`)
    }
  } catch (err) {
    console.error(err)
  }
}

main()
