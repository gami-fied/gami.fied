# Reverse proxy and HTTPS

Run Gami.Fied behind a reverse proxy that handles HTTPS. The usual setup uses two addresses: one for the dashboard and one for the API.

| Address | Goes to |
| :--- | :--- |
| `app.example.com` | The dashboard on port 3000, with `/api/*` and `/v1/*` sent straight to the API |
| `api.example.com` | The API on port 3001, for your servers and SDKs |

Sending `/api/*` and `/v1/*` straight to the API skips a hop. Without that route everything still works, because the dashboard forwards those paths itself.

## Settings in `.env`

```bash
BETTER_AUTH_URL=https://api.example.com
NEXT_PUBLIC_APP_URL=https://app.example.com
TRUST_PROXY=true
```

Set `TRUST_PROXY=true` only behind a proxy that overwrites the `X-Forwarded-*` headers. Without one, clients could fake their IP address and get around rate limits. A narrower setting is safer where you can use it: `TRUST_PROXY=1` trusts exactly one proxy in front of the API, and `TRUST_PROXY=10.0.0.5` (or a range such as `10.0.0.0/8`) trusts only that proxy's address.

Browsers may call the API from `NEXT_PUBLIC_APP_URL`. To let your own site call it too, for example with the React components, add it to `TRUSTED_ORIGINS`, separated by commas.

The API and dashboard ports are published on `127.0.0.1` only, so a proxy on the same machine can reach them and nobody else can go around it. That matters with `TRUST_PROXY=true`: a client that reached the API directly could send its own `X-Forwarded-For` and get past rate limits and API key address allowlists.

If your proxy runs on another machine, set `BIND_ADDRESS=0.0.0.0` in `.env` and restrict the ports to that machine with a firewall. If the proxy runs in the same Compose network, as Caddy does below, you can remove the published `ports` altogether.

## Caddy

Caddy gets and renews certificates by itself. This is `Caddyfile.example` from the repository. Run Caddy on the same Compose network, or change `api` and `dashboard` to `localhost` if it runs on the host.

```text
app.example.com {
	@api path /api/* /v1/*
	reverse_proxy @api api:3001
	reverse_proxy dashboard:3000
}

api.example.com {
	reverse_proxy api:3001
}
```

## nginx

The live stream that powers toasts and live leaderboards uses server-sent events, so turn off buffering for the API. Certificates are left to you, for example with Certbot.

```nginx
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}

server {
  listen 443 ssl;
  server_name app.example.com;
  # ssl_certificate and ssl_certificate_key go here

  location ~ ^/(api|v1)/ {
    proxy_pass http://127.0.0.1:3001;
    include /etc/nginx/gami-proxy.conf;
  }

  location / {
    proxy_pass http://127.0.0.1:3000;
    include /etc/nginx/gami-proxy.conf;
  }
}

server {
  listen 443 ssl;
  server_name api.example.com;
  # ssl_certificate and ssl_certificate_key go here

  location / {
    proxy_pass http://127.0.0.1:3001;
    include /etc/nginx/gami-proxy.conf;
  }
}
```

With `/etc/nginx/gami-proxy.conf`:

```nginx
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
# Server-sent events must reach the browser straight away.
proxy_buffering off;
proxy_read_timeout 1h;
```

`X-Forwarded-For` is set to the client address, not appended to, so clients cannot add their own.

## Check it

```bash
curl https://api.example.com/health
```

Then sign in to the dashboard at `https://app.example.com`, and open a page with live updates to check that the stream connects.
