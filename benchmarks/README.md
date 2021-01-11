# Rendezvous benchmarks

This benchmark contains a simulator to stress test a rendezvous server and gather performance metrics from it.

## Running

For running the benchmarks, it is required to install the dependencies of the `libp2p-rendezvous`, as well as Docker. With those installed, you only need to run the `index.js` file as follows:

```sh
$ npm install
$ cd benchmarks
$ node index.js
```

While default values exist for benchmarking, you can use CLI parameters to configure how to run the benchmark.

It is worth mentioning that this benchmark runner will be stressing a rendezvous server running in a separate process. It will run the configured number of libp2p client nodes in parallel, including their Rendezvous operations. As a result, a massive number of clients might degrade the overall performance of the clients as they will all be running in the same machine and process.

Network Latency is not considered in this benchmark. The benchmark focus on sending rendezvous requests over the wire through local connections.

### Configuration 

```sh
// Usage: $0 [--nClients <number>] [--nNamespaces <number>] [--initialRegistrations <number>]
//           [--benchmarkRuns <number>] [--benchmarkType <TYPE>] [--outputFile <path>]
//           [--discoverLimit <number>] [--discoverInexistentNamespaces]
```

### Metrics

The metrics that can be obtained from this benchmark setup are the following:

- Operations {Register, Discover}
  - Average response time
  - Maximum response time
  - Median response time
- Server performance
  - CPU
  - Memory

The Response Times (RT) metrics are measured in milliseconds while the Memory (Mem) metrics are measured in MB. CPU usage is a % value.

## Created Performance testing scenarios

There are a few considerations that we need to have before observing the results:

- Massive number of clients might degrade the overall performance of the clients as they will all be running in the same machine and process.
  - Response times will be influenced by Node's event loop as a large number of asynchronous operations will happen on the client side.
- Number of connections open will influence the overall memory consumption, specially with a large number of parallel operations
  - In a real world scenario, connections will be open and closed per Rendezvous operation, while this benchmark kept them open for faster results.

To ease performance evaluation on this repo, a benchmark shell script was created for running several combinations of inputs in the benchmark, according to the tables below.

### Register

Measure adding n registrations. Each operation in the following table

| Type | Clients | Io registrations | Operations | Namespaces |
|------|---------|------------------|------------|------------|
| `Register` | 5 | 0 | 500 | 10 |
| `Register` | 5 | 1000 | 500 | 10 |
| `Register` | 10 | 1000 | 500 | 10 |
| `Register` | 100 | 1000 | 500 | 10 |
| `Register` | 100 | 1000 | 1000 | 10 |
| `Register` | 100 | 10000 | 500 | 10 |
| `Register` | 100 | 10000 | 1000 | 10 |
| `Register` | 50 | 100000 | 500 | 10 |
| `Register` | 50 | 100000 | 1000 | 10 |
| `Register` | 100 | 100000 | 500 | 10 |
| `Register` | 100 | 100000 | 1000 | 10 |
| `Register` | 200 | 100000 | 500 | 10 |
| `Register` | 200 | 100000 | 1000 | 10 |
| `Register` | 200 | 200000 | 1000 | 10 |

### Discover

1. Measure discover existing registrations in series with limit of 20

| Type | Clients | Io registrations | Operations | Namespaces |
|------|---------|------------------|------------|------------|
| `Discover` | 5 | 1000 | 500 | 10 |
| `Discover` | 5 | 1000 | 500 | 100 |
| `Discover` | 10 | 10000 | 500 | 10 |
| `Discover` | 10 | 10000 | 500 | 100 |
| `Discover` | 10 | 10000 | 1000 | 10 |
| `Discover` | 10 | 10000 | 1000 | 100 |
| `Discover` | 100 | 100000 | 500 | 10 |
| `Discover` | 100 | 100000 | 500 | 100 |

2. Measure discover existing registrations in series with limit of 100

| Type | Clients | Io registrations | Operations | Namespaces |
|------|---------|------------------|------------|------------|
| `Discover` | 5 | 1000 | 500 | 10 |
| `Discover` | 5 | 1000 | 500 | 100 |
| `Discover` | 10 | 10000 | 500 | 10 |
| `Discover` | 10 | 10000 | 500 | 100 |
| `Discover` | 10 | 10000 | 1000 | 10 |
| `Discover` | 10 | 10000 | 1000 | 100 |
| `Discover` | 100 | 100000 | 500 | 10 |
| `Discover` | 100 | 100000 | 500 | 100 |

3. Measure trying to discover peers on inexistent namespaces.

| Type | Clients | Io registrations | Operations | Namespaces |
|------|---------|------------------|------------|------------|
| `Discover` | 5 | 0 | 500 | 10 |
| `Discover` | 5 | 0 | 1000 | 10 |
| `Discover` | 10 | 0 | 1000 | 10 |
| `Discover` | 10 | 0 | 1000 | 100 |
| `Discover` | 100 | 0 | 10000 | 10 |
| `Discover` | 100 | 0 | 10000 | 100 |
| `Discover` | 10 | 10000 | 10000 | 100 |
| `Discover` | 100 | 10000 | 10000 | 100 |
| `Discover` | 10 | 100000 | 10000 | 100 |
| `Discover` | 100 | 100000 | 10000 | 100 |

### Results obtained

Running in a Macbook with 2.6 GHz 6-Core Intel Core i7 and 16 GB 2400 MHz DDR4.

The Response Times (RT) metrics are measured in milliseconds while the Memory (Mem) metrics are measured in MB. CPU usage is a % value.

**Register**

|   Type   | Clients | Io Reg | Namespaces | Ops | Avg RT | Median RT | Max RT | Avg CPU | Median CPU | Max CPU | Avg Mem | Median Mem | Max Mem |
|----------|---------|--------|------------|-----|--------|-----------|--------|---------|------------|---------|---------|------------|---------|
| REGISTER | 5 | 100 | 10 | 500 | 16 | 15 | 26 | 31 | 42 | 61 | 98 | 98 | 106 |
| REGISTER | 5 | 1000 | 10 | 500 | 14 | 14 | 26 | 34 | 37 | 67 | 113 | 112 | 114 |
| REGISTER | 10 | 1000 | 10 | 500 | 23 | 22 | 55 | 34 | 23 | 60 | 143 | 141 | 149 |
| REGISTER | 100 | 1000 | 10 | 500 | 221 | 224 | 308 | 23 | 22 | 48 | 133 | 132 | 136 |
| REGISTER | 100 | 1000 | 10 | 1000 | 276 | 277 | 410 | 26 | 41 | 54 | 138 | 134 | 165 |
| REGISTER | 100 | 10000 | 10 | 500 | 1900 | 282 | 8468 | 15 | 18 | 75 | 364 | 362 | 382 |
| REGISTER | 100 | 10000 | 10 | 1000 | 1061 | 292 | 8017 | 15 | 19 | 76 | 393 | 392 | 397 |
| REGISTER | 50 | 100000 | 10 | 500 | 23686 | 358 | 57365 | 11 | 8 | 88 | 2341 | 2334 | 2645 |
| REGISTER | 50 | 100000 | 10 | 1000 | 10055 | 425 | 56977 | 10 | 0 | 89 | 2501 | 2543 | 2887 |
| REGISTER | 100 | 100000 | 10 | 500 | 45273 | 674 | 55370 | 11 | 6 | 95 | 2691 | 2718 | 2787 |
| REGISTER | 100 | 100000 | 10 | 1000 | 22849 | 870 | 55060 | 11 | 11 | 88 | 2166 | 2225 | 2522 |
| REGISTER | 200 | 100000 | 10 | 500 | 24572 | 2456 | 108989 | 10 | 10 | 90 | 2468 | 2476 | 2655 |
| REGISTER | 200 | 100000 | 10 | 1000 | 61448 | 2069 | 299530 | 10 | 3 | 87 | 2515 | 2545 | 2742 |
| REGISTER | 200 | 200000 | 10 | 1000 | 168163 | 2485 | 830998 | 12 | 3 | 93 | 2814 | 2896 | 3286 |

The median Response Time keeps a value below 1000 milliseconds when the server is interacting in parallel with 100 (or less) clients. It increases with the increase of clients interacting in parallel. These results are also affected by running 200 clients in the same process/machine and would probably be better when running in different machines as the Event Loop would be considerably more available to each client.

As expected, with the increase of clients connected to a single server doing multiple Register operations in parallel the memory consumption increase. Regarding CPU usage, except for some spikes over time, the average and median usage is low.

**Discover with limit of 20**

|   Type   | Clients | Io Reg | Namespaces | Ops | Avg RT | Median RT | Max RT | Avg CPU | Median CPU | Max CPU | Avg Mem | Median Mem | Max Mem |
|----------|---------|--------|------------|-----|--------|-----------|--------|---------|------------|---------|---------|------------|---------|
| DISCOVER | 5 | 1000 | 10 | 500 | 4 | 4 | 12 | 24 | 34 | 59 | 115 | 115 | 116 |
| DISCOVER | 5 | 1000 | 100 | 500 | 5 | 5 | 17 | 29 | 32 | 66 | 114 | 113 | 115 |
| DISCOVER | 10 | 10000 | 10 | 500 | 144 | 7 | 5129 | 17 | 20 | 67 | 332 | 330 | 359 |
| DISCOVER | 10 | 10000 | 100 | 500 | 177 | 7 | 6505 | 17 | 9 | 88 | 367 | 369 | 370 |
| DISCOVER | 10 | 10000 | 10 | 1000 | 80 | 7 | 5721 | 15 | 9 | 86 | 330 | 330 | 331 |
| DISCOVER | 10 | 10000 | 100 | 1000 | 94 | 7 | 6437 | 16 | 18 | 84 | 354 | 353 | 397 |
| DISCOVER | 100 | 100000 | 10 | 500 | 26379 | 118 | 112840 | 10 | 0 | 92 | 2009 | 2045 | 2204 |
| DISCOVER | 100 | 100000 | 100 | 500 | 30609 | 139 | 123132 | 11 | 8 | 93 | 2229 | 2276 | 2416 |

Like in the Register Response Times, the median response Times are fairly low. But, as more and more requests accumulate and the benchmark process Event Loop cannot handle efficiently all the client responses. In addition, memory and CPU usage also increased as more and more clients.

**Discover with limit of 100**

|   Type   | Clients | Io Reg | Namespaces | Ops | Avg RT | Median RT | Max RT | Avg CPU | Median CPU | Max CPU | Avg Mem | Median Mem | Max Mem |
|----------|---------|--------|------------|-----|--------|-----------|--------|---------|------------|---------|---------|------------|---------|
| DISCOVER | 5 | 1000 | 10 | 500 | 4 | 4 | 16 | 34 | 0 | 103 | 110 | 111 | 111 |
| DISCOVER | 5 | 1000 | 100 | 500 | 5 | 5 | 16 | 29 | 0 | 89 | 111 | 113 | 113 |
| DISCOVER | 10 | 10000 | 10 | 500 | 166 | 9 | 6168 | 16 | 20 | 94 | 322 | 319 | 346 |
| DISCOVER | 10 | 10000 | 100 | 500 | 192 | 9 | 6658 | 18 | 18 | 93 | 352 | 352 | 353 |
| DISCOVER | 10 | 10000 | 10 | 1000 | 80 | 9 | 5274 | 18 | 19 | 97 | 326 | 325 | 362 |
| DISCOVER | 10 | 10000 | 100 | 1000 | 102 | 9 | 6701 | 15 | 18 | 98 | 320 | 315 | 346 |
| DISCOVER | 100 | 100000 | 10 | 500 | 29002 | 118 | 119308 | 10 | 0 | 149 | 2062 | 2021 | 2292 |
| DISCOVER | 100 | 100000 | 100 | 500 | 30290 | 114 | 127063 | 10 | 5 | 154 | 1995 | 2037 | 2120 |

The difference in results between the default interval of 20 and bigger interval of 100 was not significant in any of the evaluated metrics.

**Discover inexistent namespaces**

|   Type   | Clients | Io Reg | Namespaces | Ops | Avg RT | Median RT | Max RT | Avg CPU | Median CPU | Max CPU | Avg Mem | Median Mem | Max Mem |
|----------|---------|--------|------------|-----|--------|-----------|--------|---------|------------|---------|---------|------------|---------|
| DISCOVER | 5 | 0 | 10 | 500 | 16 | 15 | 56 | 24 | 39 | 42 | 96 | 96 | 103 |
| DISCOVER | 5 | 0 | 10 | 1000 | 17 | 16 | 107 | 20 | 26 | 44 | 102 | 103 | 110 |
| DISCOVER | 10 | 0 | 5 | 1000 | 19 | 18 | 88 | 65 | 65 | 65 | 90 | 90 | 90 |
| DISCOVER | 10 | 0 | 100 | 1000 | 20 | 19 | 61 | 23 | 21 | 56 | 101 | 101 | 109 |
| DISCOVER | 100 | 0 | 10 | 10000 | 241 | 228 | 1012 | 22 | 15 | 79 | 282 | 294 | 299 |
| DISCOVER | 100 | 0 | 100 | 10000 | 176 | 172 | 569 | 22 | 3 | 68 | 261 | 270 | 283 |
| DISCOVER | 10 | 10000 | 100 | 10000 | 37 | 26 | 7795 | 16 | 8 | 103 | 277 | 203 | 457 |
| DISCOVER | 100 | 10000 | 100 | 10000 | 348 | 266 | 7664 | 21 | 13 | 73 | 301 | 261 | 428 |
| DISCOVER | 10 | 100000 | 100 | 10000 | 291 | 26 | 162046 | 12 | 5 | 153 | 1956 | 1935 | 2191 |
| DISCOVER | 100 | 100000 | 100 | 10000 | 1779 | 291 | 178066 | 12 | 4 | 150 | 2392 | 2618 | 2828 |

There were no different conclusions from observing these results compared to the previous ones.

**Final Remarks**

Generally, libp2p nodes who register namespaces aim to be found for providing a specific service to boost the network. This way, they will probably not be much interested in discovering other peers. On the other side, peers who will discover peers providing a given service will likely not provide themselves any service. Moreover, they will not be continuously trying to discover peers. This is not a rule, but a general expectation to consider the results obtained. For instance, this can be used to discover peers sharing a pubsub topics to improve a given topology.

Taking into account the above consideration, let's consider a network of 1 Million libp2p nodes interacting with a rendezvous server where the average requests per 24 Hours are 8 requests per peer. This means around:

- 8M requests per day
- 333.333k requests per hour
- 5.555k requests per minute
- 92 requests per second

In this context, around 92 connections would be established per second to create a rendezvous request, wait for it to be processed and receive a response. This will be bigger if the network gets bigger, or if peers do more requests than the mentioned average. In addition, DoS attacks might also happen.

Comparing these numbers with the results obtained, we can see that for around 100 connections simultaneously interacting with the rendezvous server, the median Round Trip times, memory consumption and CPU usage are within acceptable intervals. However, as requests accumulate it is also likely that some requests will take longer to process, even with a client per machine state. It is important highlighting that running 100+ clients in a single machine & process will also be a bottleneck and results should be better in "real" environment.

The ideal scenario for a deployment of a Rendezvous Server will be to have clusters of rendezvous servers backed by a federated DB. This would guarantee that the server keeps healthy and with good response times. For the above example with 1M nodes, we should probably have a cluster with 3 rendezvous servers, which would receive an average of 30 requests per second. The average does not mean that in certain times they can get to 50 requests per second, or even more.
