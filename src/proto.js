'use strict'

const protons = require('protons')

module.exports = protons(`
message Message {
  enum MessageType {
    REGISTER = 0;
    REGISTER_RESPONSE = 1;
    UNREGISTER = 2;
    DISCOVER = 3;
    DISCOVER_RESPONSE = 4;
  }

  enum ResponseStatus {
    OK                  = 0;
    E_INVALID_NAMESPACE = 100;
    E_INVALID_PEER_INFO = 101;
    E_INVALID_TTL       = 102;
    E_INVALID_COOKIE    = 103;
    E_NOT_AUTHORIZED    = 200;
    E_INTERNAL_ERROR    = 300;
    E_UNAVAILABLE       = 400;
  }

  message Register {
    optional string ns = 1;
    // signedPeerRecord contains a serialized SignedEnvelope containing a PeerRecord,
    // signed by the sending node. It contains the same addresses as the listenAddrs field, but
    // in a form that lets us share authenticated addrs with other peers.
    optional bytes signedPeerRecord = 2;
    optional int64 ttl = 3; // in seconds
  }

  message RegisterResponse {
    optional ResponseStatus status = 1;
    optional string statusText = 2;
    optional int64 ttl = 3; // in seconds
  }

  message Unregister {
    optional string ns = 1;
    optional bytes id = 2;
  }

  message Discover {
    optional string ns = 1;
    optional int64 limit = 2;
    optional bytes cookie = 3;
  }

  message DiscoverResponse {
    repeated Register registrations = 1;
    optional bytes cookie = 2;
    optional ResponseStatus status = 3;
    optional string statusText = 4;
  }

  optional MessageType type = 1;
  optional Register register = 2;
  optional RegisterResponse registerResponse = 3;
  optional Unregister unregister = 4;
  optional Discover discover = 5;
  optional DiscoverResponse discoverResponse = 6;
}`)
