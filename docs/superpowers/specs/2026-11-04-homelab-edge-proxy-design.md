# Homelab edge proxy on `uniroo.dev` — design

Date: 2026-11-04. Status: approved in conversation. Amends
`2026-11-02-cicd-homelab-design.md`, whose "HTTPS via Tailscale" section this replaces.

## Intent

The homelab will host several apps: SaxoDash, Navidrome now, more later.
`tailscale serve` gives a machine one hostname, so a second app would mean telling apps
apart by port or by path prefix. Ports are unmemorable. A path prefix means rebuilding
SaxoDash's React app and Django to run under a sub-path. Instead, each app gets a
subdomain of `uniroo.dev`, all served by one Caddy on the host. Everything stays
reachable only over Tailscale.

## Decisions

1. **Domain `uniroo.dev`, registered and DNS-hosted at Cloudflare.** It is chosen now
   because SaxoDash's address ends up in the Saxo LIVE redirect URI, the Enable Banking
   whitelist, `ALLOWED_HOSTS`/`CSRF_TRUSTED_ORIGINS`/`FRONTEND_URL`, and every browser's
   stored login. Changing it later means redoing all of them.
2. **Private by DNS, not by firewall rules alone.** One wildcard `A` record
   `*.uniroo.dev` points at the server's Tailscale address (`100.x.y.z`), proxy status
   "DNS only". The name resolves for anyone, but the address is only reachable from the
   tailnet. No router port-forward exists or is needed.
3. **Certificates by ACME DNS-01.** Caddy proves ownership by writing a TXT record
   through Cloudflare's API, so Let's Encrypt never has to reach the server. This yields
   one wildcard certificate for `*.uniroo.dev` that covers every future app. `.dev` is
   HSTS-preloaded, so browsers refuse plain HTTP outright; valid certificates are
   mandatory, not optional.
4. **One Caddy per server, owned by no app.** `deploy/edge/` holds its own compose
   project (`edge`), started by hand once, not by SaxoDash's deploy workflow. SaxoDash
   only supplies an upstream. An app deploy can therefore never take the other apps
   offline, and the edge proxy is the only thing on the host listening on 80/443.
5. **Caddy is built with the `caddy-dns/cloudflare` plugin** (`deploy/edge/Dockerfile`,
   `xcaddy` on the pinned official image). The stock image cannot do DNS-01 against
   Cloudflare.
6. **The Cloudflare credential is a scoped API token**, not the Global API Key:
   `Zone·DNS·Edit` + `Zone·Zone·Read` on `uniroo.dev` only. It lives in
   `/srv/edge/.env` (mode 600), like every other secret, never in GitHub.

## Hostnames

| Hostname | Upstream |
|---|---|
| `saxo.uniroo.dev` | `saxodash:80`, an alias on the shared `edge` Docker network |
| `music.uniroo.dev` | Navidrome via `host.docker.internal:<port>` (CasaOS-managed, publishes a host port) |
| `casa.uniroo.dev` | CasaOS dashboard via `host.docker.internal:8080` |
| anything else | `abort`: connection closed, no default site |

## How SaxoDash plugs in

The 2026-11-02 design's `proxy` service stays. It serves the built frontend and
forwards `/api/` to gunicorn. What changes:

- It **publishes no host port**. It joins the external `edge` network with the alias
  `saxodash`, and the edge Caddy reaches it there. Postgres, Redis, web, worker and
  beat stay on the stack's private default network only.
- **Forwarded headers must survive two hops.** Edge Caddy sets
  `X-Forwarded-Proto: https`. If the inner proxy is Caddy, it overwrites that header
  unless the edge is a trusted proxy: the inner Caddyfile needs
  `servers { trusted_proxies static private_ranges }`. If it is nginx, it must pass
  `$http_x_forwarded_proto` through rather than `$scheme`.
- **Django must read that header.** Production settings set `SECURE_SSL_REDIRECT`
  but no `SECURE_PROXY_SSL_HEADER`. Behind any proxy, Django sees plain HTTP and
  redirects every request to HTTPS forever. The production-settings work adds
  `SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')` under `not DEBUG`.
  This is safe only because gunicorn is unreachable except through the proxies.
- Server env: `ALLOWED_HOSTS=saxo.uniroo.dev`,
  `CSRF_TRUSTED_ORIGINS=https://saxo.uniroo.dev`, `FRONTEND_URL=https://saxo.uniroo.dev`,
  `SAXO_REDIRECT_URI=https://saxo.uniroo.dev/api/saxo/callback/`, and the frontend built
  same-origin, so `VITE_API_BASE_URL` is empty-relative and CORS is not needed.
- The Saxo OAuth callback is a browser redirect, not a call from Saxo's servers. A
  tailnet-only address therefore works, provided the browser doing the login is on
  the tailnet.

## Server prerequisites

- **CasaOS's dashboard listens on port 80 by default.** It moves to 8080 before the
  edge starts (CasaOS settings, or `/etc/casaos/gateway.ini`), and is then reached as
  `casa.uniroo.dev`.
- Tailscale installed and up before the edge starts.
- `docker network create edge`, once. Both compose projects declare it `external`, so
  neither can delete it.
- Caddy's `/data` (certificates, ACME account) is bind-mounted at `/srv/edge/data`, so a
  rebuilt container does not re-request certificates and hit Let's Encrypt rate limits.

Step-by-step commands: `deploy/edge/README.md`.

## Non-goals

- Public exposure of any app. If Navidrome must later reach a device that cannot run
  Tailscale, that one hostname gets a Cloudflare Tunnel of its own. SaxoDash holds LIVE
  broker tokens and stays tailnet-only permanently.
- Binding 80/443 to the Tailscale interface only. Docker fails to start the container
  if `tailscale0` is not up yet at boot. Since nothing forwards those ports from the
  router, LAN-only reachability is accepted instead.
- Moving Navidrome out of CasaOS. It is proxied where it already runs.

## Anti-goals

- An app's deploy restarting or reconfiguring the edge proxy.
- The Cloudflare token, or any other secret, in the repository.
- A Cloudflare-proxied (orange-cloud) record for a homelab name. Cloudflare cannot reach
  a Tailscale address, and it would put a third party inside the TLS session for the
  finance app.

## Verification

- `docker compose logs caddy` reports the `*.uniroo.dev` certificate obtained.
- On a tailnet device: `https://music.uniroo.dev` loads with a valid certificate.
- Off the tailnet: no hostname answers.
- After the SaxoDash stack is up: `https://saxo.uniroo.dev` logs in, `/admin/` login
  works (CSRF over the proxy), and no request loops on a 301 (proxy SSL header).
