'use strict'

class NS {
  constructor (name, que) { // name is a utf8 string
    this.name = name
    this.hexName = Buffer.from(name).toString('hex') // needed to prevent queue-dos attacks
    this.que = que
    this.id = {}
    this.sorted = []
  }
  addPeer (pi, ts, ttl, isOnline) { // isOnline returns a bool if the rpc connection still exists
    const id = pi.id.toB58String()
    this.id[id] = {pi, ts, ttl}
    if (ttl) {
      let expireAt = ts + ttl * 1000
      this.id[id].online = () => Date.now() >= expireAt
    } else {
      this.id[id].online = isOnline
    }
    this.update()
  }
  removePeer (pid) {
    delete this.id[pid]
    this.update()
  }
  update () {
    this.que.add('sort@' + this.hexName, () => {
      this.sorted = Object.keys(this.id).map(id => { return {id, ts: this.id[id].ts} }).sort((a, b) => a.ts - b.ts)
    })
  }
  getPeers (cookie, limit, ownId) {
    cookie = cookie.length ? parseInt(cookie.toString(), 10) : 0
    let p = this.sorted.filter(p => p.ts > cookie && p.id !== ownId).slice(0, limit).map(p => this.id[p.id])
    let newCookie
    if (p.length) {
      newCookie = Buffer.from(p[p.length - 1].ts.toString())
    } else {
      newCookie = Buffer.from('')
    }
    return {cookie: newCookie, peers: p}
  }
  gc () {
    return Object.keys(this.id).filter(k => !this.id[k].online()).map(k => delete this.id[k]).length
  }
  get useless () {
    return !Object.keys(this.id).length
  }
}

class BasicStore {
  constructor (main) {
    this.main = main
  }
  create (name) {
    return new NS(name, this.main.que)
  }
}

module.exports = BasicStore
module.exports.NS = NS
