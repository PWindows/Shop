# PWindows production readiness runbook

This runbook covers external systems that are not configured by the Website, Shop, or `website-common` repositories. Do not treat a repository deployment as completing these actions.

## Protected placeholders

The Stripe `price_PLACEHOLDER` values, `https://your-worker.example.com/create-checkout`, `_products/undefined.md`, placeholder imagery, coming-soon actions, and promo scaffolding are intentional placeholders. Leave them unchanged until the owning service is ready and an explicit launch change is approved. Retained theme source assets remain under `assets/extra/`; the shared theme hook and gem manifest prevent them from being published.

## Player lookup API

1. Treat `GET /shop/login?username=...` as lookup only, never authentication.
2. Accept only normalized Minecraft names matching `^[A-Za-z0-9_]{3,16}$`; reject duplicate parameters and oversized requests.
3. Resolve the canonical username and UUID from an authoritative source. Return `exists` as a JSON boolean and, when true, a canonical `username`, UUID, and preferably an opaque short-lived `lookup_token`.
4. Rate-limit by IP and normalized player name, log aggregate failures without storing unnecessary IP or username data, and set a narrow CORS allowlist for `https://shop.pwindows.qzz.io`.
5. Add negative tests for nonexistent, malformed, Unicode-confusable, and overlong names. The impossible-name test must return `exists: false`.

## Checkout worker

1. Accept only `requested_currency`, `player`, `items`, `donations`, and optional `promo_code`; ignore or reject all other fields.
2. Resolve every `product_id` to a server-owned catalog record and Stripe price ID. Never accept a client price or Stripe ID.
3. Re-resolve the player UUID or validate the short-lived lookup token. Enforce quantities from 1 through the server-owned maximum, regardless of the client’s limit of 99.
4. Validate donation integer minor units, allowed currencies, configured minimum/maximum amounts, promotions, product availability, idempotency, and replay protection.
5. Return JSON containing only an HTTPS `session_url` on an allowlisted checkout hostname. Keep error responses generic and attach an internal correlation ID.

## Support hostname

Keep all public support, feedback, report, and appeal links on `https://discord.pwindows.qzz.io/` until the support hostname is restored.

```sh
dig +short support.pwindows.qzz.io A
dig +short support.pwindows.qzz.io AAAA
dig +short support.pwindows.qzz.io CNAME
curl --fail --silent --show-error --location --max-time 15 --output /dev/null --write-out '%{http_code} %{url_effective}\n' https://support.pwindows.qzz.io/
openssl s_client -connect support.pwindows.qzz.io:443 -servername support.pwindows.qzz.io </dev/null
```

Restore links only after DNS, TLS, the destination, and uptime monitoring all pass.

## Response headers

Inventory current third-party dependencies, then deploy Content-Security-Policy in report-only mode. The allowlist should be limited to the PWindows origins, the player API, the configured checkout worker/provider, Crafatar avatars, Discord imagery, and tracked game-image hosts actually present in generated output. Move to enforcement only after reports are clean.

Configure `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` with unused capabilities disabled, and a frame restriction through CSP `frame-ancestors`. Enable HSTS only after every covered hostname supports HTTPS; do not add `includeSubDomains` or `preload` while any subdomain is unverified.

## Post-deployment read-only checks

```sh
curl --fail --silent --show-error --location --max-time 15 --output /dev/null --write-out '%{http_code} %{url_effective}\n' https://www.pwindows.qzz.io/ https://shop.pwindows.qzz.io/ https://shop.pwindows.qzz.io/products/ https://shop.pwindows.qzz.io/404.html
curl --fail --silent --show-error https://www.pwindows.qzz.io/robots.txt
curl --fail --silent --show-error https://www.pwindows.qzz.io/sitemap.xml
curl --fail --silent --show-error https://shop.pwindows.qzz.io/robots.txt
curl --fail --silent --show-error https://shop.pwindows.qzz.io/sitemap.xml
curl --silent --show-error --dump-header - --output /dev/null https://www.pwindows.qzz.io/
curl --silent --show-error --dump-header - --output /dev/null https://shop.pwindows.qzz.io/
curl --fail-with-body --silent --show-error --get --data-urlencode 'username=__definitely_not_a_real_player__' https://api.pwindows.qzz.io/shop/login
```

Confirm canonical redirects, valid TLS, one root sitemap per host, no localized robots/sitemap copies, negative player lookup behavior, CSP reporting, and all required response headers.
