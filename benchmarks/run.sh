# Register

node index.js --nClients 5 --initialRegistrations 0 --benchmarkRuns 500 --nNamespaces 10 --benchmarkType REGISTER --outputFile './output-register.md'
node index.js --nClients 5 --initialRegistrations 1000 --benchmarkRuns 500 --nNamespaces 10 --benchmarkType REGISTER --outputFile './output-register.md'
node index.js --nClients 10 --initialRegistrations 1000 --benchmarkRuns 500 --nNamespaces 10 --benchmarkType REGISTER --outputFile './output-register.md'
node index.js --nClients 100 --initialRegistrations 1000 --benchmarkRuns 500 --nNamespaces 10 --benchmarkType REGISTER --outputFile './output-register.md'
node index.js --nClients 100 --initialRegistrations 1000 --benchmarkRuns 1000 --nNamespaces 10 --benchmarkType REGISTER --outputFile './output-register.md'
node index.js --nClients 100 --initialRegistrations 10000 --benchmarkRuns 500 --nNamespaces 10 --benchmarkType REGISTER --outputFile './output-register.md'
node index.js --nClients 100 --initialRegistrations 10000 --benchmarkRuns 1000 --nNamespaces 10 --benchmarkType REGISTER --outputFile './output-register.md'
node index.js --nClients 50 --initialRegistrations 100000 --benchmarkRuns 500 --nNamespaces 10 --benchmarkType REGISTER --outputFile './output-register.md'
node index.js --nClients 50 --initialRegistrations 100000 --benchmarkRuns 1000 --nNamespaces 10 --benchmarkType REGISTER --outputFile './output-register.md'
node index.js --nClients 100 --initialRegistrations 100000 --benchmarkRuns 500 --nNamespaces 10 --benchmarkType REGISTER --outputFile './output-register.md'
node index.js --nClients 100 --initialRegistrations 100000 --benchmarkRuns 1000 --nNamespaces 10 --benchmarkType REGISTER --outputFile './output-register.md'
node index.js --nClients 200 --initialRegistrations 100000 --benchmarkRuns 500 --nNamespaces 10 --benchmarkType REGISTER --outputFile './output-register.md'
node index.js --nClients 200 --initialRegistrations 100000 --benchmarkRuns 1000 --nNamespaces 10 --benchmarkType REGISTER --outputFile './output-register.md'
node index.js --nClients 200 --initialRegistrations 200000 --benchmarkRuns 1000 --nNamespaces 10 --benchmarkType REGISTER --outputFile './output-register.md'

# Discover (limit 20)

node index.js --nClients 5 --initialRegistrations 1000 --benchmarkRuns 500 --nNamespaces 10 --benchmarkType DISCOVER --outputFile './output-discover-limit.md'
node index.js --nClients 5 --initialRegistrations 1000 --benchmarkRuns 500 --nNamespaces 100 --benchmarkType DISCOVER --outputFile './output-discover-limit.md'
node index.js --nClients 10 --initialRegistrations 10000 --benchmarkRuns 500 --nNamespaces 10 --benchmarkType DISCOVER --outputFile './output-discover-limit.md'
node index.js --nClients 10 --initialRegistrations 10000 --benchmarkRuns 500 --nNamespaces 100 --benchmarkType DISCOVER --outputFile './output-discover-limit.md'
node index.js --nClients 10 --initialRegistrations 10000 --benchmarkRuns 1000 --nNamespaces 10 --benchmarkType DISCOVER --outputFile './output-discover-limit.md'
node index.js --nClients 10 --initialRegistrations 10000 --benchmarkRuns 1000 --nNamespaces 100 --benchmarkType DISCOVER --outputFile './output-discover-limit.md'
node index.js --nClients 100 --initialRegistrations 100000 --benchmarkRuns 500 --nNamespaces 10 --benchmarkType DISCOVER --outputFile './output-discover-limit.md'
node index.js --nClients 100 --initialRegistrations 100000 --benchmarkRuns 500 --nNamespaces 100 --benchmarkType DISCOVER --outputFile './output-discover-limit.md'

# # Discover (limit 100)

node index.js --nClients 5 --initialRegistrations 1000 --benchmarkRuns 500 --nNamespaces 10 --benchmarkType DISCOVER --discoverLimit 100 --outputFile './output-discover-limit-100.md'
node index.js --nClients 5 --initialRegistrations 1000 --benchmarkRuns 500 --nNamespaces 100 --benchmarkType DISCOVER --discoverLimit 100 --outputFile './output-discover-limit-100.md'
node index.js --nClients 10 --initialRegistrations 10000 --benchmarkRuns 500 --nNamespaces 10 --benchmarkType DISCOVER --discoverLimit 100 --outputFile './output-discover-limit-100.md'
node index.js --nClients 10 --initialRegistrations 10000 --benchmarkRuns 500 --nNamespaces 100 --benchmarkType DISCOVER --discoverLimit 100 --outputFile './output-discover-limit-100.md'
node index.js --nClients 10 --initialRegistrations 10000 --benchmarkRuns 1000 --nNamespaces 10 --benchmarkType DISCOVER --discoverLimit 100 --outputFile './output-discover-limit-100.md'
node index.js --nClients 10 --initialRegistrations 10000 --benchmarkRuns 1000 --nNamespaces 100 --benchmarkType DISCOVER --discoverLimit 100 --outputFile './output-discover-limit-100.md'
node index.js --nClients 100 --initialRegistrations 100000 --benchmarkRuns 500 --nNamespaces 10 --benchmarkType DISCOVER --discoverLimit 100 --outputFile './output-discover-limit-100.md'
node index.js --nClients 100 --initialRegistrations 100000 --benchmarkRuns 500 --nNamespaces 100 --benchmarkType DISCOVER --discoverLimit 100 --outputFile './output-discover-limit-100.md'

# # Discover inexistent

node index.js --nClients 5 --initialRegistrations 0 --benchmarkRuns 500 --nNamespaces 10 --benchmarkType DISCOVER --discoverInexistentNamespaces --outputFile './output-discover-inexistent.md'
node index.js --nClients 5 --initialRegistrations 0 --benchmarkRuns 1000 --nNamespaces 10 --benchmarkType DISCOVER --discoverInexistentNamespaces --outputFile './output-discover-inexistent.md'
node index.js --nClients 10 --initialRegistrations 0 --benchmarkRuns 1000--nNamespaces 10 --benchmarkType DISCOVER --discoverInexistentNamespaces --outputFile './output-discover-inexistent.md'
node index.js --nClients 10 --initialRegistrations 0 --benchmarkRuns 1000 --nNamespaces 100 --benchmarkType DISCOVER --discoverInexistentNamespaces --outputFile './output-discover-inexistent.md'
node index.js --nClients 100 --initialRegistrations 0 --benchmarkRuns 10000 --nNamespaces 10 --benchmarkType DISCOVER --discoverInexistentNamespaces --outputFile './output-discover-inexistent.md'
node index.js --nClients 100 --initialRegistrations 0 --benchmarkRuns 10000 --nNamespaces 100 --benchmarkType DISCOVER --discoverInexistentNamespaces --outputFile './output-discover-inexistent.md'
node index.js --nClients 10 --initialRegistrations 10000 --benchmarkRuns 10000 --nNamespaces 100 --benchmarkType DISCOVER --discoverInexistentNamespaces --outputFile './output-discover-inexistent.md'
node index.js --nClients 100 --initialRegistrations 10000 --benchmarkRuns 10000 --nNamespaces 100 --benchmarkType DISCOVER --discoverInexistentNamespaces --outputFile './output-discover-inexistent.md'
node index.js --nClients 10 --initialRegistrations 100000 --benchmarkRuns 10000 --nNamespaces 100 --benchmarkType DISCOVER --discoverInexistentNamespaces --outputFile './output-discover-inexistent.md'
node index.js --nClients 100 --initialRegistrations 100000 --benchmarkRuns 10000 --nNamespaces 100 --benchmarkType DISCOVER --discoverInexistentNamespaces --outputFile './output-discover-inexistent.md'