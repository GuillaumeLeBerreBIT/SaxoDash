# Edge proxy (`*.uniroo.dev`)

One Caddy for the whole server. Every app on the homelab is reached through it by
subdomain; no app publishes a port of its own. Design:
`docs/superpowers/specs/2026-11-04-homelab-edge-proxy-design.md`.

| Address | Upstream |
|---|---|
| `saxodash.uniroo.dev` | `saxodash:80` on the `edge` network (SaxoDash's own proxy) |
| `music.uniroo.dev` | Navidrome on the host, port `NAVIDROME_PORT` (default 4533) |
| `casa.uniroo.dev` | CasaOS dashboard on the host, port `CASAOS_PORT` (default 8080) |
| anything else | connection closed |

## One-time setup on the server

0. **Get the files**: the repo is public, so clone over HTTPS, with no SSH key or token:
   ```sh
   sudo apt install -y git
   sudo git clone https://github.com/GuillaumeLeBerreBIT/SaxoDash.git /opt/homelab
   ```
   This clone is for the edge proxy only and is updated by hand (`git pull`). Never point
   the edge at the deploy runner's checkout: the runner rewrites it on every deploy.
   `docker compose version` must answer; if not, `sudo apt install docker-compose-plugin`.
1. **Tailscale**: `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`,
   then note `tailscale ip -4` (a `100.x.y.z` address).
2. **Cloudflare DNS**: one `A` record, name `*`, value the `100.x.y.z` address,
   proxy status **DNS only** (grey cloud).
3. **Cloudflare API token**: My Profile → API Tokens → "Edit zone DNS" template,
   permissions `Zone·DNS·Edit` + `Zone·Zone·Read`, zone `uniroo.dev` only.
4. **Move CasaOS off port 80**: CasaOS → Settings → WebUI port → `8080`
   (or set `port=8080` in `/etc/casaos/gateway.ini` and
   `sudo systemctl restart casaos-gateway`). Check nothing else holds 80/443:
   `sudo ss -tlnp '( sport = :80 or sport = :443 )'`.
5. **Folders and secrets**:
   ```sh
   sudo mkdir -p /srv/edge/data /srv/edge/config
   sudo cp deploy/edge/.env.example /srv/edge/.env
   sudo chmod 600 /srv/edge/.env
   sudo nano /srv/edge/.env
   ```
   Fill in `CLOUDFLARE_API_TOKEN` and `ACME_EMAIL` (Let's Encrypt expiry notices).
   Set `NAVIDROME_PORT` to the host port CasaOS gave Navidrome
   (`docker ps | grep -i navidrome`).
6. **Shared network**, once: `docker network create edge`.
7. **Start**: `cd /opt/homelab/deploy/edge && sudo docker compose up -d --build`.

## Checking it

- `docker compose logs -f caddy` should show `certificate obtained successfully`
  for `*.uniroo.dev` within a minute.
- From a device on the tailnet: `https://music.uniroo.dev` opens Navidrome with a
  valid certificate. `saxodash.uniroo.dev` answers 502 until the SaxoDash stack is up.
- From a device **off** the tailnet, nothing answers. That is the point.

## Adding an app

Join its web container to the `edge` network with an alias, then add a block
inside `*.uniroo.dev { … }` in the Caddyfile:

```
@name host name.uniroo.dev
handle @name {
	reverse_proxy <alias>:<port>
}
```

`docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile` applies it
without dropping connections. The wildcard certificate already covers the new name.

## Troubleshooting

- **Certificate never issues**: the token lacks `Zone·Zone·Read`, or is scoped to
  the wrong zone. The log names the Cloudflare error.
- **Name does not resolve on a phone/laptop**: Tailscale is off on that device, or
  a router's DNS-rebind protection drops answers in `100.64.0.0/10`. With
  Tailscale on, the device asks MagicDNS (`100.100.100.100`) and is unaffected.
- **Bind error on 80/443**: CasaOS (step 4) or another app still holds the port.
