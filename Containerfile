FROM node:22-bookworm-slim AS base

# Install network diagnostic tools (ping, traceroute, arp, iproute2) and build tools for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    iputils-ping \
    traceroute \
    net-tools \
    iproute2 \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NETFIX_DB_PATH=/data/netfix.db
ENV NETFIX_HOSTNAME=Hub

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 3000

CMD ["npm", "run", "start"]
