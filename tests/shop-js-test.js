const assert = require("node:assert/strict");

const {
  MAX_PRODUCT_QUANTITY,
  buildCheckoutPayload,
  chooseInitialCurrency,
  isAllowedCheckoutUrl,
  normalizeCartItem,
  normalizeProductId,
  normalizeUuid,
  validatePlayerLookupResponse,
} = require("../assets/js/extra.js");

assert.equal(MAX_PRODUCT_QUANTITY, 99);
assert.equal(normalizeProductId("/products/1300"), "1300");
assert.equal(normalizeProductId("/zh-cn/products/40/"), "40");
assert.equal(normalizeProductId("donate_1720000000000"), "donate");
assert.equal(normalizeProductId("../../bad"), null);
assert.equal(normalizeProductId("<script>"), null);

assert.equal(chooseInitialCurrency({ storedCurrency: "MYR", activeLocale: "en-us" }), "MYR");
assert.equal(chooseInitialCurrency({ activeLocale: "zh-cn", browserLocales: ["en-US"] }), "CNY");
assert.equal(chooseInitialCurrency({ activeLocale: "en-gb", browserLocales: ["ms-MY"] }), "MYR");
assert.equal(chooseInitialCurrency({ activeLocale: "en-gb", browserLocales: ["en-US"] }), "USD");

assert.equal(normalizeUuid("12345678-1234-1234-1234-1234567890ab"), "123456781234123412341234567890ab");
assert.equal(normalizeUuid("not-a-uuid"), null);
assert.deepEqual(validatePlayerLookupResponse({ exists: false }), { exists: false });
assert.equal(validatePlayerLookupResponse({ exists: true, username: "bad name", uuid: "123" }), null);
const player = validatePlayerLookupResponse({
  exists: true,
  username: "Player_1",
  uuid: "123456781234123412341234567890ab",
  lookup_token: "opaque-token",
});
assert.equal(player.username, "Player_1");

const normal = normalizeCartItem({
  productId: "/products/1300",
  title: "1300 PCoins",
  quantity: 1000,
  stripeId: "must-not-survive",
  priceUsd: 14,
});
assert.equal(normal.productId, "1300");
assert.equal(normal.quantity, 99);
assert.equal(Object.hasOwn(normal, "stripeId"), false);

const donation = normalizeCartItem({
  productId: "donate_123",
  title: "Support",
  isDonation: true,
  donationAmount: 5,
  currency: "MYR",
});
assert.equal(donation.productId, "donate");
assert.equal(donation.donationAmountMinor, 500);
assert.equal(donation.donationCurrency, "MYR");

const payload = buildCheckoutPayload([normal, donation], player, "USD", "SUMMER");
assert.deepEqual(payload.items, [{ product_id: "1300", quantity: 99 }]);
assert.deepEqual(payload.donations, [{ amount_minor: 500, currency: "MYR" }]);
assert.equal(payload.player.lookup_token, "opaque-token");
assert.equal(payload.promo_code, "SUMMER");
assert.equal(JSON.stringify(payload).includes("price"), false);
assert.equal(JSON.stringify(payload).includes("stripe"), false);

assert.equal(isAllowedCheckoutUrl("https://checkout.stripe.com/c/pay/test", ["checkout.stripe.com"]), true);
assert.equal(isAllowedCheckoutUrl("http://checkout.stripe.com/c/pay/test", ["checkout.stripe.com"]), false);
assert.equal(isAllowedCheckoutUrl("https://checkout.stripe.com.example.org/", ["checkout.stripe.com"]), false);

console.log("Shop JavaScript tests passed.");
