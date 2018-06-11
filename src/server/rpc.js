'use strict'

const pull = require('pull-stream')
const ppb = require('pull-protocol-buffers')
const {Message, MessageType, ResponseStatus} = require('../proto')
const Pushable = require('pull-pushable')
const debug = require('debug')
const log = debug('libp2p:rendezvous:server:rpc')
const Peer = require('peer-info')
const Id = require('peer-id')
const through = require('pull-through')

const MAX_NS_LENGTH = 255 // TODO: spec this
const MAX_DISCOVER_LIMIT = 1000 // TODO: spec this

const registerErrors = {
  0: 'OK',
  100: 'Invalid namespace provided',
  101: 'Invalid peer-info provided',
  102: 'Invalid TTL provided',
  103: 'Invalid cookie provided',
  200: 'Not authorized',
  300: 'Internal Server Error'
}

const makeStatus = (status) => {
  return {
    status,
    statusText: registerErrors[status]
  }
}

const makeResponse = (type, data) => {
  let o = { type: MessageType[type.toUpperCase() + '_RESPONSE'] }
  o[type.toLowerCase() + 'Response'] = data
  return o
}

const handlers = { // a handler takes (peerInfo, peerIdAsB58String, StoreClass, store, msg, peerIsOnline) and returns [newStore, responseOrNull]
  [MessageType.REGISTER]: (pi, id, Store, store, msg, isOnline) => {
    let {ns, peer, ttl} = msg.register
    log('register@%s: trying register on %s', id, ns || '<GLOBAL>')
    if (peer.id && new Id(peer.id).toB58String() !== id) { // check if this peer really owns address (TODO: get rid of that)
      log('register@%s: auth err (want %s)', id, new Id(peer.id).toB58String())
      return [store, makeResponse('request', makeStatus(ResponseStatus.E_NOT_AUTHORIZED))]
    } else if (!peer.id) {
      peer.id = pi.id.toBytes() // field is optional so add it before creating the record
    }

    if (ns > MAX_NS_LENGTH) {
      log('register@%s: ns invalid', id)
      return [store, makeResponse('register', makeStatus(ResponseStatus.E_INVALID_NAMESPACE))]
    }

    pi = new Peer(new Id(peer.id))
    peer.addrs.forEach(a => pi.multiaddrs.add(a))

    if (!ttl) {
      ttl = isOnline
    }

    let record = {
      peer: pi,
      ttl,
      received_at: Date.now()
    }

    if (ns) {
      store = Store.addPeerToNamespace(Store.createNamespace(store, ns), ns, record) // TODO: should this add to global ns too?
    } else {
      store = Store.addPeer(store, record)
    }

    log('register@%s: registered on %s', id, ns || '<GLOBAL>')

    return [store, makeResponse('register', makeStatus(ResponseStatus.OK))]
  },
  [MessageType.UNREGISTER]: (pi, id, Store, store, msg) => {
    let ns = msg.unregister.ns
    log('unregister@%s: unregister from %s', id, ns || '<GLOBAL>')

    if (ns) {
      store = Store.removePeerFromNamespace(store, ns, id)
    } else {
      store = Store.removePeer(store, id)
    }

    return [store]
  },
  [MessageType.DISCOVER]: (pi, id, Store, store, msg) => {
    let {ns, limit, cookie} = msg.discover
    if (limit <= 0 || limit > MAX_DISCOVER_LIMIT) limit = MAX_DISCOVER_LIMIT
    log('discover@%s: discover on %s (%s peers)', id, ns || '<GLOBAL>', limit)

    let nsStore
    let registrations = []

    if (ns) {
      nsStore = Store.utils.getNamespaces(store).get(ns)
    } else {
      nsStore = store.get('global_namespace')
    }

    if (nsStore) {
      if (cookie && cookie.length) { // if client gave us a cookie, try to parse it
        cookie = parseInt(String(cookie), 10)
      }
      if (Number.isNaN(cookie) || typeof cookie !== 'number') { // if cookie is invalid, set it to 0
        cookie = 0
      }
      registrations = nsStore.toArray()
        .map(r => r[1].toJS()) // get only value without key
        .filter(e => e.received_at > cookie) // filter out previous peers
        .slice(0, limit + 1)
        .filter(e => e.peer.id.toB58String() !== id) // filter out own peer-id
        .slice(0, limit)
      cookie = Buffer.from(String(registrations.length ? registrations[registrations.length - 1].received_at : cookie)) // if we got peers then use the last peer's received_at value, otherwise reuse current cookie
    } else {
      cookie = Buffer.from('0')
    }

    if (registrations.length) {
      registrations = registrations.map(p => {
        return {
          ns,
          peer: {
            id: p.peer.id.toBytes(),
            addrs: p.peer.multiaddrs.toArray().map(a => a.buffer)
          }
        }
      })
    }

    return [store, makeResponse('discover', Object.assign(makeStatus(ResponseStatus.OK), {
      registrations,
      cookie
    }))]
  }
}

const RPC = (pi, main) => {
  let id = pi.id.toB58String()

  let online = true

  return pull(
    ppb.decode(Message),
    through(function (data) {
      let handler = handlers[data.type]
      if (!handler) return log('ignore@%s: invalid/unknown type %s', id, data.type) // ignore msg
      let [store, resp] = handler(pi, id, main.Store, main.store, data, () => online)
      if (resp) this.queue(resp)
      main.store = store // update store
      main.gc()
    }, end => {
      online = false
      log('end@%s: %s', id, end)
    }),
    ppb.encode(Message)
  )
}

module.exports = RPC
