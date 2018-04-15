'use strict'

const protons = require('protons')

module.exports = protons(`
message Message {
  enum MessageType {
    REGISTER = 0;
    UNREGISTER = 1;
    DISCOVER = 2;
    DISCOVER_RESPONSE = 3;
  }

  message PeerInfo {
    optional bytes id = 1;
    repeated bytes addrs = 2;
  }

  message Register {
    optional string ns = 1;
    optional PeerInfo peer = 2;
    optional int64 ttl = 3;
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
  optional Unregister unregister = 3;
  optional Discover discover = 4;
  optional DiscoverResponse discoverResponse = 5;
}`)
