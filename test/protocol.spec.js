'use strict'
/* eslint-env mocha */

const { expect } = require('aegir/utils/chai')

const { pipe } = require('it-pipe')
const lp = require('it-length-prefixed')
const { collect } = require('streaming-iterables')
const { toBuffer } = require('it-buffer')

const multiaddr = require('multiaddr')
const PeerId = require('peer-id')
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

describe('protocol', () => {
  const ns = 'test-ns'
  const ttl = 7.2e6 * 1e-3

  let datastore
  let rServer
  let client
  let peerIds
  let multiaddrServer

  before(async () => {
    peerIds = await createPeerId({ number: 4 })
  })

  // Create client and server and connect them
  beforeEach(async () => {
    datastore = new Datastore()
    rServer = new RendezvousServer({
      peerId: peerIds[0],
      addresses: {
        listen: [`${relayAddr}/p2p-circuit`]
      },
      ...defaultLibp2pConfig
    }, { datastore })
    multiaddrServer = multiaddr(`${relayAddr}/p2p-circuit/p2p/${peerIds[0].toB58String()}`)

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

    const [response] = await pipe(
      [Message.encode({
        type: MESSAGE_TYPE.REGISTER,
        register: {
          signedPeerRecord: client.peerStore.addressBook.getRawEnvelope(client.peerId),
          ns,
          ttl
        }
      })],
      lp.encode(),
      stream,
      lp.decode(),
      toBuffer,
      collect
    )

    const recMessage = Message.decode(response)
    expect(recMessage).to.exist()
    expect(recMessage.type).to.eql(MESSAGE_TYPE.REGISTER_RESPONSE)
    expect(recMessage.registerResponse.status).to.eql(Message.ResponseStatus.OK)

    expect(rServer.datastore.nsRegistrations.size).to.eql(1)
  })

  it('fails to register if invalid namespace', async () => {
    const conn = await client.dial(multiaddrServer)
    const { stream } = await conn.newStream(PROTOCOL_MULTICODEC)

    const [response] = await pipe(
      [Message.encode({
        type: MESSAGE_TYPE.REGISTER,
        register: {
          signedPeerRecord: client.peerStore.addressBook.getRawEnvelope(client.peerId),
          ns: 'x'.repeat(300),
          ttl
        }
      })],
      lp.encode(),
      stream,
      lp.decode(),
      toBuffer,
      collect
    )

    const recMessage = Message.decode(response)
    expect(recMessage).to.exist()
    expect(recMessage.type).to.eql(MESSAGE_TYPE.REGISTER_RESPONSE)
    expect(recMessage.registerResponse.status).to.eql(RESPONSE_STATUS.E_INVALID_NAMESPACE)

    expect(rServer.datastore.nsRegistrations.size).to.eql(0)
  })

  it('fails to register if invalid ttl', async () => {
    const conn = await client.dial(multiaddrServer)
    const { stream } = await conn.newStream(PROTOCOL_MULTICODEC)

    const [response] = await pipe(
      [Message.encode({
        type: MESSAGE_TYPE.REGISTER,
        register: {
          signedPeerRecord: client.peerStore.addressBook.getRawEnvelope(client.peerId),
          ns,
          ttl: 5e10 * 1e-3
        }
      })],
      lp.encode(),
      stream,
      lp.decode(),
      toBuffer,
      collect
    )

    const recMessage = Message.decode(response)
    expect(recMessage).to.exist()
    expect(recMessage.type).to.eql(MESSAGE_TYPE.REGISTER_RESPONSE)
    expect(recMessage.registerResponse.status).to.eql(RESPONSE_STATUS.E_INVALID_TTL)

    expect(rServer.datastore.nsRegistrations.size).to.eql(0)
  })

  it('fails to register if invalid signed peer record', async () => {
    const conn = await client.dial(multiaddrServer)
    const { stream } = await conn.newStream(PROTOCOL_MULTICODEC)

    const [response] = await pipe(
      [Message.encode({
        type: MESSAGE_TYPE.REGISTER,
        register: {
          signedPeerRecord: client.peerStore.addressBook.getRawEnvelope(PeerId.createFromCID(relayAddr.getPeerId())),
          ns,
          ttl
        }
      })],
      lp.encode(),
      stream,
      lp.decode(),
      toBuffer,
      collect
    )

    const recMessage = Message.decode(response)
    expect(recMessage).to.exist()
    expect(recMessage.type).to.eql(MESSAGE_TYPE.REGISTER_RESPONSE)
    expect(recMessage.registerResponse.status).to.eql(RESPONSE_STATUS.E_NOT_AUTHORIZED)
  })

  describe('with previous registrations', () => {
    beforeEach(async () => {
      const conn = await client.dial(multiaddrServer)
      const { stream } = await conn.newStream(PROTOCOL_MULTICODEC)

      await pipe(
        [Message.encode({
          type: MESSAGE_TYPE.REGISTER,
          register: {
            signedPeerRecord: client.peerStore.addressBook.getRawEnvelope(client.peerId),
            ns,
            ttl
          }
        })],
        lp.encode(),
        stream,
        async (source) => {
          for await (const _ of source) { } // eslint-disable-line
        }
      )

      expect(rServer.datastore.nsRegistrations.size).to.eql(1)
    })

    it('can unregister a namespace', async () => {
      expect(rServer.datastore.nsRegistrations.size).to.eql(1)

      const conn = await client.dial(multiaddrServer)
      const { stream } = await conn.newStream(PROTOCOL_MULTICODEC)

      await pipe(
        [Message.encode({
          type: MESSAGE_TYPE.UNREGISTER,
          unregister: {
            id: client.peerId.toBytes(),
            ns
          }
        })],
        lp.encode(),
        stream,
        async (source) => {
          for await (const _ of source) { } // eslint-disable-line
        }
      )

      expect(rServer.datastore.nsRegistrations.size).to.eql(0)
    })

    it('can discover a peer registered into a namespace', async () => {
      const conn = await client.dial(multiaddrServer)
      const { stream } = await conn.newStream(PROTOCOL_MULTICODEC)

      const [response] = await pipe(
        [Message.encode({
          type: MESSAGE_TYPE.DISCOVER,
          discover: {
            ns,
            limit: 50
          }
        })],
        lp.encode(),
        stream,
        lp.decode(),
        toBuffer,
        collect
      )

      const recMessage = Message.decode(response)
      expect(recMessage).to.exist()
      expect(recMessage).to.exist()
      expect(recMessage.type).to.eql(MESSAGE_TYPE.DISCOVER_RESPONSE)
      expect(recMessage.discoverResponse.status).to.eql(Message.ResponseStatus.OK)
      expect(recMessage.discoverResponse.registrations).to.exist()
      expect(recMessage.discoverResponse.registrations).to.have.lengthOf(1)
    })
  })
})
