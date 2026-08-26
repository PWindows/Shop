# PWindows Shop

The static Jekyll storefront for [shop.pwindows.qzz.io](https://shop.pwindows.qzz.io). It uses the shared `pwindows-theme` and generates localized routes with `jekyll-polyglot`.

Player lookup is informational onboarding, not authentication. The checkout service must revalidate player identity and resolve product IDs to server-owned prices. See `tools/production-runbook.md` for the external API, checkout, DNS, and hosting requirements.

## Local verification

```sh
bundle exec jekyll build
bundle exec htmlproofer ./_site --disable-external
bundle exec ruby tools/verify-site.rb ./_site
node --check assets/js/extra.js
node tests/shop-js-test.js
```

Stripe price IDs, the checkout-worker URL, the undefined product, placeholder imagery, and coming-soon controls are intentional placeholders and must remain unchanged until an approved launch change.
