FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV VITE_API_BASE_URL="" \
    VITE_ENABLE_BANKING_CONNECT_BASE_URL=""
RUN npm run build

FROM caddy:2.10.2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
