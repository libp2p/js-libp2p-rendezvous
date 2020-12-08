'use strict'
/* eslint-env mocha */

const { expect } = require('aegir/utils/chai')

const { pipe } = require('it-pipe')
const lp = require('it-length-prefixed')
const { collect } = require('streaming-iterables')
const { toBuffer } = require('it-buffer')

const multiaddr = require('multiaddr')
const Libp2p = require('libp2p')

const RendezvousServer = require('../src/server')
const Datastore = require('../src/server/datastores/memory')
const {
  PROTOCOL_MULTICODEC
} = require('../src/server/constants')
const { Message } = require('../src/proto')
const MESSAGE_TYPE = Message.MessageType
const RESPONSE_STATUS = Message.ResponseStatus

const {
  createPeerId,
  defaultLibp2pConfig
} = require('./utils')

const { MULTIADDRS_WEBSOCKETS } = require('./fixtures/browser')
const relayAddr = MULTIADDRS_WEBSOCKETS[0]

describe('DoS attack protection', () => {
  const ns = 'test-ns'
  const ttl = 7.2e6 * 1e-3

  let datastore
  let rServer
  let client
  let peerId
  let multiaddrServer

  // Create client and server and connect them
  beforeEach(async () => {
    [peerId] = await createPeerId()

    datastore = new Datastore()
    rServer = new RendezvousServer({
      peerId: peerId,
      addresses: {
        listen: [`${relayAddr}/p2p-circuit`]
      },
      ...defaultLibp2pConfig
    }, { maxRegistrations: 1, datastore }) // Maximum of one registration

    multiaddrServer = multiaddr(`${relayAddr}/p2p-circuit/p2p/${peerId.toB58String()}`)

    client = await Libp2p.create({
      addresses: {
        listen: [`${relayAddr}/p2p-circuit`]
      },
      ...defaultLibp2pConfig
    })

    await Promise.all([rServer, client].map((n) => n.start()))
  })

  afterEach(async () => {
    await Promise.all([rServer, client].map((n) => n.stop()))
  })

  it('can register a namespace', async () => {
    const conn = await client.dial(multiaddrServer)
    const { stream } = await conn.newStream(PROTOCOL_MULTICODEC)

    const responses = await pipe(
      [
        Message.encode({
          type: MESSAGE_TYPE.REGISTER,
          register: {
            signedPeerRecord: client.peerStore.addressBook.getRawEnvelope(client.peerId),
            ns,
            ttl
          }
        }),
        Message.encode({
          type: MESSAGE_TYPE.REGISTER,
          register: {
            signedPeerRecord: client.peerStore.addressBook.getRawEnvelope(client.peerId),
            ns,
            ttl
          }
        })
      ],
      lp.encode(),
      stream,
      lp.decode(),
      toBuffer,
      collect
    )

    const recMessage = Message.decode(responses[1])
    expect(recMessage).to.exist()
    expect(recMessage.type).to.eql(MESSAGE_TYPE.REGISTER_RESPONSE)
    expect(recMessage.registerResponse.status).to.eql(RESPONSE_STATUS.E_NOT_AUTHORIZED)

    // Only one record
    expect(rServer.datastore.nsRegistrations.size).to.eql(1)
  })
})
