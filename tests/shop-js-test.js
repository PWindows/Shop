const assert = require("node:assert/strict");

const {
  MAX_PRODUCT_QUANTITY,
  buildCheckoutPayload,
  chooseInitialCurrency,
  configureDevelopmentBypass,
  initializeShop,
  isAllowedCheckoutUrl,
  isLocalDevelopmentHost,
  normalizeCartItem,
  normalizeProductId,
  normalizeUuid,
  safeShopRedirect,
  setupPlayerSession,
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

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

assert.equal(isLocalDevelopmentHost("localhost"), true);
assert.equal(isLocalDevelopmentHost("127.0.0.1"), true);
assert.equal(isLocalDevelopmentHost("[::1]"), true);
assert.equal(isLocalDevelopmentHost("shop.pwindows.qzz.io"), false);
const bypassStorage = memoryStorage();
assert.equal(configureDevelopmentBypass({ hostname: "localhost", search: "?dev-bypass=1", storage: bypassStorage }), true);
assert.equal(configureDevelopmentBypass({ hostname: "localhost", search: "", storage: bypassStorage }), true);
assert.equal(configureDevelopmentBypass({ hostname: "localhost", search: "?dev-bypass=0", storage: bypassStorage }), false);
bypassStorage.setItem("pwindows_dev_browse_bypass", "1");
assert.equal(configureDevelopmentBypass({ hostname: "shop.pwindows.qzz.io", search: "?dev-bypass=1", storage: bypassStorage }), false);
assert.equal(bypassStorage.getItem("pwindows_dev_browse_bypass"), "1");

const shopOrigin = "https://shop.pwindows.qzz.io";
const shopLanguages = ["en-us", "zh-cn", "ja-jp"];
assert.equal(safeShopRedirect("/products", shopOrigin), "/products");
assert.equal(safeShopRedirect("/zh-cn/products/1300?ref=gate", shopOrigin, shopLanguages), "/zh-cn/products/1300?ref=gate");
assert.equal(safeShopRedirect("/zz-zz/products", shopOrigin, shopLanguages), null);
assert.equal(safeShopRedirect("//evil.example/products", shopOrigin), null);
assert.equal(safeShopRedirect("/\\evil.example/products", shopOrigin), null);
assert.equal(safeShopRedirect("https://shop.pwindows.qzz.io.evil.example/products", shopOrigin), null);
assert.equal(safeShopRedirect("/admin", shopOrigin), null);

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
assert.throws(() => buildCheckoutPayload([normal], null, "USD", ""), /validated player/i);
assert.throws(() => buildCheckoutPayload([normal], player, "EUR", ""), /currency/i);

assert.equal(isAllowedCheckoutUrl("https://checkout.stripe.com/c/pay/test", ["checkout.stripe.com"]), true);
assert.equal(isAllowedCheckoutUrl("http://checkout.stripe.com/c/pay/test", ["checkout.stripe.com"]), false);
assert.equal(isAllowedCheckoutUrl("https://checkout.stripe.com.example.org/", ["checkout.stripe.com"]), false);
assert.equal(isAllowedCheckoutUrl("https://user@checkout.stripe.com/c/pay/test", ["checkout.stripe.com"]), false);
assert.equal(isAllowedCheckoutUrl("https://checkout.stripe.com:444/c/pay/test", ["checkout.stripe.com"]), false);

const globalNames = ["document", "window", "navigator", "localStorage", "sessionStorage"];
const originalGlobals = Object.fromEntries(
  globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(global, name)]),
);
const classList = { toggle() {}, contains() { return false; } };
Object.defineProperty(global, "document", { configurable: true, writable: true, value: {
  documentElement: { lang: "en-us" },
  body: { children: [], classList },
  getElementById() { return null; },
  querySelectorAll() { return []; },
} });
Object.defineProperty(global, "window", { configurable: true, writable: true, value: {
  location: {
    hostname: "localhost",
    origin: "http://localhost",
    pathname: "/",
    search: "?dev-bypass=1",
    assign() {},
    replace() {},
  },
  requestAnimationFrame(callback) { callback(); },
} });
Object.defineProperty(global, "navigator", { configurable: true, writable: true, value: { language: "en-US", languages: ["en-US"] } });
Object.defineProperty(global, "localStorage", { configurable: true, writable: true, value: memoryStorage() });
Object.defineProperty(global, "sessionStorage", { configurable: true, writable: true, value: memoryStorage() });
assert.doesNotThrow(() => initializeShop());

const productPage = {};
global.document.getElementById = (id) => id === "product-page-data" ? productPage : null;
const localLocation = {
  pathname: "/products/1300",
  search: "",
  replaceValue: null,
  replace(value) { this.replaceValue = value; },
};
assert.equal(setupPlayerSession({ player: null, bypass: true, location: localLocation }), "bypass");
assert.equal(localLocation.replaceValue, null);
assert.equal(setupPlayerSession({ player: null, bypass: false, location: localLocation }), "redirect");
assert.match(localLocation.replaceValue, /^\/\?redirect=/);

Object.entries(originalGlobals).forEach(([name, descriptor]) => {
  if (descriptor === undefined) delete global[name];
  else Object.defineProperty(global, name, descriptor);
});

console.log("Shop JavaScript tests passed.");
