FROM node:20-alpine AS build

WORKDIR /opt/application

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public
COPY scripts ./scripts
COPY test ./test
COPY run.sh ./
RUN chmod 755 run.sh && npm test

FROM node:20-alpine AS runtime

WORKDIR /opt/application
ENV NODE_ENV=production
ENV PORT=8000

COPY --from=build /opt/application/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
COPY public ./public
COPY --chmod=755 run.sh ./

EXPOSE 8000

USER node
CMD ["/opt/application/run.sh"]
