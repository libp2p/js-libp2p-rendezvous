FROM node:lts-buster

# Install deps
RUN apt-get update && apt-get install -y

# Get dumb-init to allow quit running interactively
RUN wget -O /usr/local/bin/dumb-init https://github.com/Yelp/dumb-init/releases/download/v1.2.0/dumb-init_1.2.0_amd64 && chmod +x /usr/local/bin/dumb-init

# Setup directories for the `node` user
RUN mkdir -p /home/node/app/rendezvous/node_modules && chown -R node:node /home/node/app/rendezvous

WORKDIR /home/node/app/rendezvous

# Install node modules
COPY package.json ./
# Switch to the node user for installation
USER node
RUN npm install --production

# Copy over source files under the node user
COPY --chown=node:node ./src ./src
COPY --chown=node:node ./README.md ./

# rendezvous defaults to 15002
EXPOSE 15002

# metrics defaults to 8003
EXPOSE 8003

# Available overrides (defaults shown):
#   --disableMetrics=false
# Server logging can be enabled via the DEBUG environment variable:
#   DEBUG=libp2p:rendezvous:*
CMD [ "/usr/local/bin/dumb-init", "node", "src/server/bin.js"]