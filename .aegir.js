'use strict'

const Libp2p = require('libp2p')
const { MULTIADDRS_WEBSOCKETS } = require('./test/fixtures/browser')
const Peers = require('./test/fixtures/peers')
const PeerId = require('peer-id')
const WebSockets = require('libp2p-websockets')
const Muxer = require('libp2p-mplex')
const { NOISE: Crypto } = require('libp2p-noise')

const delay = require('delay')
const execa = require('execa')
const pWaitFor = require('p-wait-for')
const isCI = require('is-ci')

let libp2p
let containerId

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

  // TODO: if not running test suite in Node, can also stop here
  // https://github.com/ipfs/aegir/issues/707
  // CI runs own datastore service
  if (isCI) {
    return
  }

  const procResult = execa.commandSync('docker run -p 3306:3306 -e MYSQL_ROOT_PASSWORD=test-secret-pw -e MYSQL_DATABASE=libp2p_rendezvous_db -d mysql:8 --default-authentication-plugin=mysql_native_password', {
    all: true
  })
  containerId = procResult.stdout

  console.log(`wait for docker container ${containerId} to be ready`)

  await pWaitFor(() => {
    const procCheck = execa.commandSync(`docker logs ${containerId}`)
    const logs = procCheck.stdout + procCheck.stderr // Docker/MySQL sends to the stderr the ready for connections...

    return logs.includes('ready for connections')
  }, {
    interval: 5000
  })
  // Some more time waiting to guarantee the container is really ready
  await delay(12e3)
}

const after = async () => {
  await libp2p.stop()

  if (isCI) {
    return
  }

  console.log('docker container is stopping')
  execa.commandSync(`docker stop ${containerId}`)
}

module.exports = {
  bundlesize: { maxSize: '250kB' },
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
