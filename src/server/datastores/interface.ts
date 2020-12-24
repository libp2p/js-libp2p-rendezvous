import PeerId from 'peer-id'

export interface DatastoreFactory <DatastoreOptions> {
  new (options?: DatastoreOptions): Datastore;
}

export interface Datastore {
  /**
   * Setup datastore.
   */
  start (): Promise<void>;
  /**
   * Tear down datastore.
   */
  stop (): void;
  /**
   * Run datastore garbage collector to remove expired records.
   */
  gc (): Promise<number>;
  /**
   * Add a rendezvous registrations.
   */
  addRegistration (namespace: string, peerId: PeerId, signedPeerRecord: Uint8Array, ttl: number): Promise<void>;
  /**
   * Get rendezvous registrations for a given namespace.
   */
  getRegistrations (namespace: string, query?: RegistrationQuery): Promise<{ registrations: Registration[], cookie?: string }>;
  /**
   * Get number of registrations of a given peer.
   */
  getNumberOfRegistrationsFromPeer (peerId: PeerId): Promise<number>;
  /**
   * Remove registration of a given namespace to a peer.
   */
  removeRegistration (ns: string, peerId: PeerId): Promise<number>;
  /**
   * Remove all registrations of a given peer.
   */
  removePeerRegistrations (peerId: PeerId): Promise<number>;
  /**
   * Reset content
   */
  reset (): Promise<void>;
}

export type RegistrationQuery = {
  limit?: number;
  cookie?: string;
}

export type Registration = {
  ns: string;
  signedPeerRecord: Uint8Array;
  ttl: number;
}
