'use strict'

const debug = require('debug')
const log = debug('libp2p:rendezvous-server:mysql')
log.error = debug('libp2p:rendezvous-server:mysql:error')

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

  reset () {
    return Promise.resolve()
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
    return new Promise((resolve, reject) => {
      this.conn.query('INSERT INTO ?? SET ?',
        ['registration', {
          namespace,
          peer_id: peerId,
          signed_peer_record: Buffer.from(signedPeerRecord),
          expiration: new Date(Date.now() + ttl)
        }], (err) => {
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
    // TODO: transaction
    const cookieWhereNotExists = () => {
      if (!cookie) return ''
      return ` AND NOT EXISTS (
        SELECT null
        FROM cookie c
        WHERE r.id = c.reg_id AND c.namespace = r.namespace
      )`
    }

    const results = await new Promise((resolve, reject) => {
      this.conn.query(
        `SELECT id, namespace, signed_peer_record, expiration FROM registration r
        WHERE namespace = ? AND expiration >= NOW()${cookieWhereNotExists()}
        ORDER BY expiration DESC
        LIMIT ?`,
        [namespace, limit],
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
          `("${this.conn.escape(cookie)}", "${this.conn.escape(entry.namespace)}", "${this.conn.escape(entry.id)}")`
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
          resolve(res[0]['COUNT(1)'])
        }
      )
    })
  }

  /**
   * Remove registration of a given namespace to a peer
   *
   * @param {string} ns
   * @param {PeerId} peerId
   * @returns {Promise<void>}
   */
  removeRegistration (ns, peerId) {
    const id = peerId.toB58String()

    return new Promise((resolve, reject) => {
      this.conn.query('DELETE FROM registration WHERE peer_id = ? AND namespace = ?',
        [id, ns],
        (err) => {
          if (err) {
            return reject(err)
          }
          resolve()
        })
    })
  }

  /**
   * Remove all registrations of a given peer
   *
   * @param {PeerId} peerId
   * @returns {Promise<void>}
   */
  removePeerRegistrations (peerId) {
    const id = peerId.toB58String()

    return new Promise((resolve, reject) => {
      this.conn.query('DELETE FROM registration WHERE peer_id = ?',
        [id],
        (err) => {
          if (err) {
            return reject(err)
          }
          resolve()
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
          created_at datetime DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id, namespace, reg_id),
          FOREIGN KEY (reg_id) REFERENCES registration(id),
          INDEX (created_at)
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
