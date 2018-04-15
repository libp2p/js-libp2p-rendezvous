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

  message PeerInfo {
    optional bytes id = 1;
    repeated bytes addrs = 2;
  }

  message Register {
    optional string ns = 1;
    optional PeerInfo peer = 2;
    optional int64 ttl = 3; // in seconds
  }

  enum RegisterStatus {
    OK = 0;
    E_INVALID_NAMESPACE = 100;
    E_INVALID_PEER_INFO = 101;
    E_NOT_AUTHORIZED    = 200;
  }

  message RegisterReponse {
    optional RegisterStatus code = 1;
  }

  message Unregister {
    optional string ns = 1;
    optional bytes id = 2;
  }

  message Discover {
    optional string ns = 1;
    optional int64 limit = 2;
    optional int64 since = 3;
  }

  message DiscoverResponse {
    repeated Register registrations = 1;
    optional int64 timestamp = 2;
  }

  optional MessageType type = 1;
  optional Register register = 2;
  optional RegisterResponse registerResponse = 3;
  optional Unregister unregister = 4;
  optional Discover discover = 5;
  optional DiscoverResponse discoverResponse = 6;
}`)
