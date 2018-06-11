'use strict'

const pull = require('pull-stream')
const ppb = require('pull-protocol-buffers')
const {Message, MessageType, ResponseStatus} = require('../proto')
const Pushable = require('pull-pushable')
const debug = require('debug')
const log = debug('libp2p-rendezvous:server:rpc')
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

// CODE BELOW IS NOT USED, REMOVED SOON

class rpc {
  constructor (main) {
    this.main = main
    this.source = Pushable()
  }
  sink (read) {
    const next = (end, msg, doend) => {
      if (doend) {
        log('crash@%s: %s', this.id, doend)
        return read(doend, next)
      }
      if (end) {
        this.online = false
        log('end@%s: %s', this.id, end)
        this.source.end()
        return
      }
      switch (msg.type) {
        case MessageType.REGISTER:
          try {
            log('register@%s: trying register on %s', this.id, msg.register.ns)
            if (msg.register.peer.id && new Id(msg.register.peer.id).toB58String() !== this.id) {
              log('register@%s: auth err (want %s)', this.id, new Id(msg.register.peer.id).toB58String())
              this.source.push({
                type: MessageType.REGISTER_RESPONSE,
                registerResponse: craftStatus(ResponseStatus.E_NOT_AUTHORIZED)
              })
              return read(null, next)
            } else if (!msg.register.peer.id) {
              msg.register.peer.id = this.pi.id.toBytes()
            }
            if (msg.register.ns > MAX_NS_LENGTH) {
              log('register@%s: ns err', this.id)
              this.source.push({
                type: MessageType.REGISTER_RESPONSE,
                registerResponse: craftStatus(ResponseStatus.E_INVALID_NAMESPACE)
              })
              return read(null, next)
            }
            const pi = new Peer(new Id(msg.register.peer.id))
            msg.register.peer.addrs.forEach(a => pi.multiaddrs.add(a))
            this.main.getNS(msg.register.ns, true).addPeer(pi, Date.now(), msg.register.ttl, () => this.online)
            log('register@%s: ok', this.id)
            this.source.push({
              type: MessageType.REGISTER_RESPONSE,
              registerResponse: craftStatus(ResponseStatus.OK)
            })
          } catch (e) {
            log('register@%s: internal error', this.id)
            log(e)
            this.source.push({
              type: MessageType.REGISTER_RESPONSE,
              registerResponse: craftStatus(ResponseStatus.E_INTERNAL_ERROR)
            })
            return read(null, next)
          }
          break
        case MessageType.UNREGISTER:
          try {
            log('unregister@%s: unregister from %s', this.id, msg.unregister.ns)
            // TODO: currently ignores id since there is no ownership error. change?
            this.main.getNS(msg.unregister.ns).removePeer(this.id)
          } catch (e) {
            return next(null, null, e)
          }
          break
        case MessageType.DISCOVER:
          try {
            // TODO: add more errors
            log('discover@%s: discover on %s', this.id, msg.discover.ns)
            if (msg.discover.limit <= 0 || msg.discover.limit > MAX_DISCOVER_LIMIT) msg.discover.limit = MAX_DISCOVER_LIMIT
            const {peers, cookie} = this.main.getNS(msg.discover.ns).getPeers(msg.discover.cookie || Buffer.from(''), msg.discover.limit, this.id)
            log('discover@%s: got %s peers', this.id, peers.length)
            this.source.push({
              type: MessageType.DISCOVER_RESPONSE,
              discoverResponse: {
                registrations: peers.map(p => {
                  return {
                    ns: msg.discover.ns,
                    peer: {
                      id: p.pi.id.toBytes(),
                      addrs: p.pi.multiaddrs.toArray().map(a => a.buffer)
                    },
                    ttl: p.ttl
                  }
                }),
                cookie
              }
            })
          } catch (e) {
            log('discover@%s: internal error', this.id)
            log(e)
            this.source.push({
              type: MessageType.DISCOVER_RESPONSE,
              registerResponse: craftStatus(ResponseStatus.E_INTERNAL_ERROR)
            })
            return read(null, next)
          }
          break
        // case MessageType.REGISTER_RESPONSE:
        // case MessageType.DISCOVER_RESPONSE:
        default: // should that disconnect or just get ignored?
          log('error@%s: sent wrong msg type %s', this.id, msg.type)
          return next(null, null, true)
      }
      read(null, next)
    }
    read(null, next)
  }
  setup (conn, cb) {
    conn.getPeerInfo((err, pi) => {
      if (err) return cb(err)
      this.pi = pi
      this.id = pi.id.toB58String()
      pull(
        conn,
        ppb.decode(Message),
        this,
        ppb.encode(Message),
        conn
      )

      this.online = true
      cb()
    })
  }
}

module.exports = RPC
