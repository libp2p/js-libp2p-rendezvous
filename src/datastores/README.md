# Rendezvous Datastores

The `libp2p-rendezvous` server will store rendezvous records over time. This number might increase exponentially over time, even with a garbage collector for removing outdated records. Accordingly, this server should leverage a database to store records in an efficient fashion.

A `MySQL` backed datastore is provided in this repository and is used by default by its server implementation. Other databases can easily be used by implementing a datastore fulfilling the [interface.ts](./interface.js).

⚠️ For testing purposes you can skip using MySQL and use a memory datastore. **This must not be used in production!**.

## MySQL Data Model

The MySQL database data model created is illustrated in the following picture:

![Data Model](../../../img/db-model.png)
