'use strict'

const debug = require('debug')
const log = debug('libp2p:rendezvous-server:mysql')
log.error = debug('libp2p:rendezvous-server:mysql:error')

const errCode = require('err-code')
const { codes: errCodes } = require('../errors')

const mysql = require('mysql')

/**
 * @typedef {import('peer-id')} PeerId
 * @typedef {import('./interface').Datastore} Datastore
 * @typedef {import('./interface').Registration} Registration
 */

/**
 * @typedef {object} MySqlOptions
 * @param {string} host
 * @param {string} user
 * @param {string} password
 * @param {string} database
 * @param {boolean} [insecureAuth = true]
 * @param {boolean} [multipleStatements = true]
 */

/**
 * @implements {Datastore}
 */
class Mysql {
  /**
   * Database manager for libp2p rendezvous.
   *
   * @param {MySqlOptions} options
   */
  constructor ({ host, user, password, database, insecureAuth = true, multipleStatements = true }) {
    this.options = {
      host,
      user,
      password,
      database,
      insecureAuth,
      multipleStatements
    }

    /**
     * Peer string identifier with current add operations.
     *
     * @type {Map<string, Set<string>>}
     */
    this._registeringPeer = new Map()
  }

  /**
   * Starts DB connection and creates needed tables if needed
   *
   * @returns {Promise<void>}
   */
  async start () {
    this.conn = mysql.createConnection(this.options)

    await this._initDB()
  }

  /**
   * Closes Database connection
   */
  stop () {
    this.conn.end()
  }

  async reset () {
    await new Promise((resolve, reject) => {
      this.conn.query(`
        DROP TABLE IF EXISTS cookie;
        DROP TABLE IF EXISTS registration;
        `, (err) => {
        if (err) {
          return reject(err)
        }
        resolve()
      })
    })
  }

  /**
   * Run datastore garbage collector to remove expired records.
   *
   * @returns {Promise<number>}
   */
  gc () {
    return new Promise((resolve, reject) => {
      this.conn.query('DELETE FROM registration WHERE expiration <= NOW()',
        (err, res) => {
          if (err) {
            return reject(err)
          }
          resolve(res.affectedRows)
        })
    })
  }

  /**
   * Add an entry to the registration table.
   *
   * @param {string} namespace
   * @param {PeerId} peerId
   * @param {Uint8Array} signedPeerRecord
   * @param {number} ttl
   * @returns {Promise<void>}
   */
  addRegistration (namespace, peerId, signedPeerRecord, ttl) {
    const id = peerId.toB58String()
    const opId = String(Math.random() + Date.now())
    const peerOps = this._registeringPeer.get(id) || new Set()

    peerOps.add(opId)
    this._registeringPeer.set(id, peerOps)

    return new Promise((resolve, reject) => {
      this.conn.query('INSERT INTO ?? SET ?',
        ['registration', {
          namespace,
          peer_id: id,
          signed_peer_record: Buffer.from(signedPeerRecord),
          expiration: new Date(Date.now() + ttl)
        }], (err) => {
          // Remove Operation
          peerOps.delete(opId)
          if (!peerOps.size) {
            this._registeringPeer.delete(id)
          }

          if (err) {
            return reject(err)
          }
          resolve()
        }
      )
    })
  }

  /**
   * Get registrations for a given namespace
   *
   * @param {string} namespace
   * @param {object} [options]
   * @param {number} [options.limit = 10]
   * @param {string} [options.cookie]
   * @returns {Promise<{ registrations: Array<Registration>, cookie?: string }>}
   */
  async getRegistrations (namespace, { limit = 10, cookie } = {}) {
    if (cookie) {
      const cookieEntries = await new Promise((resolve, reject) => {
        this.conn.query(
          'SELECT * FROM cookie WHERE id = ? LIMIT 1',
          [cookie],
          (err, results) => {
            if (err) {
              return reject(err)
            }
            resolve(results)
          }
        )
      })
      if (!cookieEntries.length) {
        throw errCode(new Error('no registrations for the given cookie'), errCodes.INVALID_COOKIE)
      }
    }

    const cookieWhereNotExists = () => {
      if (!cookie) return ''
      return ` AND NOT EXISTS (
        SELECT null
        FROM cookie c
        WHERE r.id = c.reg_id AND c.namespace = r.namespace AND c.id = ?
      )`
    }

    const results = await new Promise((resolve, reject) => {
      this.conn.query(
        `SELECT id, namespace, peer_id, signed_peer_record, expiration FROM registration r
        WHERE namespace = ? AND expiration >= NOW() ${cookieWhereNotExists()}
        ORDER BY expiration DESC
        LIMIT ?`,
        [namespace, cookie || limit, limit],
        (err, results) => {
          if (err) {
            return reject(err)
          }
          resolve(results)
        }
      )
    })

    if (!results.length) {
      return {
        registrations: [],
        cookie
      }
    }

    cookie = cookie || String(Math.random() + Date.now())

    // Store in cookies if results available
    await new Promise((resolve, reject) => {
      this.conn.query(
        `INSERT INTO ?? (id, namespace, reg_id) VALUES ${results.map((entry) =>
          `(${this.conn.escape(cookie)}, ${this.conn.escape(entry.namespace)}, ${this.conn.escape(entry.id)})`
        )}`, ['cookie']
        , (err) => {
          if (err) {
            return reject(err)
          }
          resolve()
        })
    })

    return {
      registrations: results.map((r) => ({
        id: r.id,
        ns: r.namespace,
        signedPeerRecord: new Uint8Array(r.signed_peer_record),
        ttl: r.expiration
      })),
      cookie
    }
  }

  /**
   * Get number of registrations of a given peer.
   *
   * @param {PeerId} peerId
   * @returns {Promise<number>}
   */
  getNumberOfRegistrationsFromPeer (peerId) {
    const id = peerId.toB58String()

    return new Promise((resolve, reject) => {
      this.conn.query('SELECT COUNT(1) FROM registration WHERE peer_id = ?',
        [id],
        (err, res) => {
          if (err) {
            return reject(err)
          }
          // DoS attack defense check
          const pendingReg = this._getNumberOfPendingRegistrationsFromPeer(peerId)
          resolve(res[0]['COUNT(1)'] + pendingReg)
        }
      )
    })
  }

  /**
   * Get number of ongoing registrations for a peer.
   *
   * @param {PeerId} peerId
   * @returns {number}
   */
  _getNumberOfPendingRegistrationsFromPeer (peerId) {
    const peerOps = this._registeringPeer.get(peerId.toB58String()) || new Set()

    return peerOps.size
  }

  /**
   * Remove registration of a given namespace to a peer
   *
   * @param {string} ns
   * @param {PeerId} peerId
   * @returns {Promise<number>}
   */
  removeRegistration (ns, peerId) {
    const id = peerId.toB58String()

    return new Promise((resolve, reject) => {
      this.conn.query('DELETE FROM registration WHERE peer_id = ? AND namespace = ?', [id, ns],
        (err, res) => {
          if (err) {
            return reject(err)
          }
          resolve(res.affectedRows)
        })
    })
  }

  /**
   * Remove all registrations of a given peer
   *
   * @param {PeerId} peerId
   * @returns {Promise<number>}
   */
  removePeerRegistrations (peerId) {
    const id = peerId.toB58String()

    return new Promise((resolve, reject) => {
      this.conn.query('DELETE FROM registration WHERE peer_id = ?', [id],
        (err, res) => {
          if (err) {
            return reject(err)
          }
          resolve(res.affectedRows)
        })
    })
  }

  /**
   * Initialize Database if tables do not exist.
   *
   * @returns {Promise<void>}
   */
  _initDB () {
    return new Promise((resolve, reject) => {
      this.conn.query(`
        CREATE TABLE IF NOT EXISTS registration (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          namespace varchar(255) NOT NULL,
          peer_id varchar(255) NOT NULL,
          signed_peer_record blob NOT NULL,
          expiration timestamp NOT NULL,
          PRIMARY KEY (id),
          INDEX (namespace, expiration, peer_id)
        );

        CREATE TABLE IF NOT EXISTS cookie (
          id varchar(21),
          namespace varchar(255),
          reg_id INT UNSIGNED,
          PRIMARY KEY (id, namespace, reg_id),
          FOREIGN KEY (reg_id) REFERENCES registration(id) ON DELETE CASCADE
        );
      `, (err) => {
        if (err) {
          return reject(err)
        }
        resolve()
      })
    })
  }
}

module.exports = Mysql
