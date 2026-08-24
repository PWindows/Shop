# PWindows production readiness runbook

This runbook covers external systems that are not configured by the Website, Shop, or `website-common` repositories. Do not treat a repository deployment as completing these actions.

## Protected placeholders

The Stripe `price_PLACEHOLDER` values, `https://your-worker.example.com/create-checkout`, `_products/undefined.md`, placeholder imagery, coming-soon actions, and promo scaffolding are intentional placeholders. Leave them unchanged until the owning service is ready and an explicit launch change is approved. Retained theme source assets remain under `assets/extra/`; the shared theme hook and gem manifest prevent them from being published.

The Shop gate logo's `1452×64` HTML declaration is an accepted compatibility exception and must remain unchanged. The shared theme's complete Alibaba CJK font files are also an accepted payload exception.

## Player lookup API

1. Treat `GET /shop/login?username=...` as lookup only, never authentication.
2. Accept only normalized Minecraft names matching `^[A-Za-z0-9_]{3,16}$`; reject duplicate parameters and oversized requests.
3. Resolve the canonical username and UUID from an authoritative source. Return `exists` as a JSON boolean and, when true, a canonical `username`, UUID, and preferably an opaque short-lived `lookup_token`.
4. Rate-limit by IP and normalized player name, log aggregate failures without storing unnecessary IP or username data, and keep the production CORS allowlist limited to `https://shop.pwindows.qzz.io`. Do not allow localhost in production.
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

## Cloudflare response-header rollout

In Cloudflare, open each production zone, then use **Rules → Transform Rules → Modify Response Header** (or the equivalent managed response-header feature) to create one version-controlled ruleset for the Website and Shop hostnames. Apply it to successful HTML responses first, then expand after asset checks pass.

1. Add `Content-Security-Policy-Report-Only` before enforcing CSP. Start with the PWindows origins plus explicit `connect-src` entries for the player API and configured checkout worker, `img-src` entries for self, Crafatar avatars, Discord imagery, and tracked remote game images, and `frame-ancestors 'none'`. Configure a reporting endpoint owned by PWindows.
2. Add `Referrer-Policy: strict-origin-when-cross-origin`.
3. Add `X-Content-Type-Options: nosniff`.
4. Add `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` and enable capabilities only after a reviewed feature requires them.
5. Keep frame restrictions in CSP; use `X-Frame-Options: DENY` as a legacy fallback while no page requires embedding.
6. Review CSP reports for at least one normal release cycle, correct the explicit dependency allowlist, then replace the report-only header with enforcing `Content-Security-Policy`.
7. Enable HSTS only after Website, Shop, API, checkout, Discord redirect, support, and every covered subdomain are confirmed HTTPS-capable. Begin with a short `max-age` without `includeSubDomains` or `preload`; increase it only after monitoring remains clean.

Do not use a wildcard for API, avatar, imagery, or checkout origins. Record the final ruleset expression, header values, Cloudflare rule IDs, activation time, and rollback owner in the deployment log.

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
curl --fail-with-body --silent --show-error --get --data-urlencode 'username=KnownPlayer' https://api.pwindows.qzz.io/shop/login
curl --silent --show-error --dump-header - --output /dev/null --header 'Origin: https://shop.pwindows.qzz.io' 'https://api.pwindows.qzz.io/shop/login?username=KnownPlayer'
curl --silent --show-error --dump-header - --output /dev/null --header 'Origin: http://localhost:4000' 'https://api.pwindows.qzz.io/shop/login?username=KnownPlayer'
curl --silent --show-error --dump-header - --output /dev/null --header 'Origin: https://evil.example' 'https://api.pwindows.qzz.io/shop/login?username=KnownPlayer'
curl --silent --show-error --output /dev/null --write-out '%{http_code} %{redirect_url}\n' https://www.pwindows.qzz.io/games/sacred-cubes
curl --silent --show-error --output /dev/null --write-out '%{http_code} %{redirect_url}\n' https://shop.pwindows.qzz.io/not-a-real-route
openssl s_client -connect www.pwindows.qzz.io:443 -servername www.pwindows.qzz.io </dev/null
openssl s_client -connect shop.pwindows.qzz.io:443 -servername shop.pwindows.qzz.io </dev/null
```

Replace `KnownPlayer` with a reviewed test account and confirm the positive response contains its canonical username and UUID. The localhost and hostile-origin responses must not include an allow-origin grant. Send a bounded burst from an approved test source and confirm the documented rate limit returns `429` plus a sane retry signal without impacting unrelated users.

After the checkout placeholder is deliberately replaced, submit one valid server-owned product request and negative requests containing a client price, Stripe ID, unknown field, invalid player, unsupported currency, quantity `0`, quantity above the server limit, malformed donation, invalid promo, and replayed idempotency key. Every negative case must be rejected. Confirm the successful response contains only an allowlisted HTTPS session URL and that userinfo, alternate ports, backslash URLs, and lookalike hostnames are rejected.

Confirm canonical redirects, valid TLS, one root sitemap per host, no localized robots/sitemap copies, positive and negative player lookup behavior, strict production CORS, rate limiting, CSP reporting, and every required response header.
