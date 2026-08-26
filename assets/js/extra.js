const CART_STORAGE_KEY = "pwindows_cart_v2";
const LEGACY_CART_STORAGE_KEY = "pwindows_cart";
const PROMO_STORAGE_KEY = "pwindows_promo";
const PLAYER_STORAGE_KEY = "pwindows_player_lookup_v2";
const CURRENCY_STORAGE_KEY = "pwindows_currency";
const DEV_BYPASS_STORAGE_KEY = "pwindows_dev_browse_bypass";
const MAX_PRODUCT_QUANTITY = 99;
const SUPPORTED_CURRENCIES = new Set(["USD", "MYR", "CNY"]);
const PLAYER_NAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/;
const PLAYER_UUID_PATTERN = /^[0-9a-f]{32}$/i;

let userCurrency = "USD";
let cartController;
let shopStrings = {};
let shopConfig = { checkoutEndpoint: "", checkoutAllowedHosts: [] };
let developmentBypass = false;

function parseJsonScript(id, fallback = {}) {
  const node = document.getElementById(id);
  if (!node) return fallback;
  try {
    const value = JSON.parse(node.textContent);
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
  } catch (_) {
    return fallback;
  }
}

function text(key, fallback) {
  return typeof shopStrings[key] === "string" ? shopStrings[key] : fallback;
}

function formatText(key, fallback, values = {}) {
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    text(key, fallback),
  );
}

function announce(message) {
  const status = document.getElementById("site-status");
  if (!status) return;
  status.textContent = "";
  window.requestAnimationFrame(() => {
    status.textContent = message;
  });
}

function safeStorageGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch (_) {
    return null;
  }
}

function safeStorageSet(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch (_) {
    return false;
  }
}

function safeStorageRemove(storage, key) {
  try {
    storage.removeItem(key);
  } catch (_) {
    // Storage can be unavailable in privacy modes; in-memory state still works.
  }
}

function isLocalDevelopmentHost(hostname) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(String(hostname).toLowerCase());
}

function configureDevelopmentBypass({ hostname, search = "", storage }) {
  if (!isLocalDevelopmentHost(hostname)) return false;
  const value = new URLSearchParams(search).get("dev-bypass");
  if (value === "1") safeStorageSet(storage, DEV_BYPASS_STORAGE_KEY, "1");
  if (value === "0") safeStorageRemove(storage, DEV_BYPASS_STORAGE_KEY);
  return safeStorageGet(storage, DEV_BYPASS_STORAGE_KEY) === "1";
}

function safeShopRedirect(value, origin, allowedLanguages = []) {
  if (typeof value !== "string" || typeof origin !== "string") return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.username || url.password) return null;
    const match = url.pathname.match(/^\/(?:([a-z]{2}-[a-z]{2})\/)?products(?:\/(?:[a-z0-9][a-z0-9-]{0,63})?)?$/i);
    if (!match) return null;
    if (match[1] && !allowedLanguages.map((language) => String(language).toLowerCase()).includes(match[1].toLowerCase())) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch (_) {
    return null;
  }
}

function getFocusable(container) {
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function setCartBackgroundInert(inert) {
  Array.from(document.body.children).forEach((element) => {
    if (
      element.id === "cart-sidebar" ||
      element.id === "cart-overlay" ||
      element.tagName === "SCRIPT"
    ) {
      return;
    }

    if (inert) {
      if (!element.hasAttribute("inert")) {
        element.setAttribute("inert", "");
        element.dataset.cartInert = "true";
      }
    } else if (element.dataset.cartInert === "true") {
      element.removeAttribute("inert");
      delete element.dataset.cartInert;
    }
  });
}

function syncBodyLock() {
  const cartOpen = Boolean(cartController?.isOpen());
  document.body.classList.toggle("overlay-open", cartOpen);
  setCartBackgroundInert(cartOpen);
}

function createOverlayController({ trigger, container, panel, overlay, openClass, openLabel, closeLabel }) {
  let lastFocused = null;

  function isOpen() {
    return container.classList.contains(openClass);
  }

  function setOpen(open, { restoreFocus = true, moveFocus = true } = {}) {
    if (open === isOpen()) return;

    if (open) {
      lastFocused = document.activeElement;
      container.classList.add(openClass);
      overlay?.classList.add(openClass);
      container.setAttribute("aria-hidden", "false");
      container.removeAttribute("inert");
      overlay?.setAttribute("aria-hidden", "false");
      trigger.setAttribute("aria-expanded", "true");
      trigger.setAttribute("aria-label", closeLabel);
      syncBodyLock();
      if (moveFocus) window.requestAnimationFrame(() => getFocusable(panel)[0]?.focus());
    } else {
      container.classList.remove(openClass);
      overlay?.classList.remove(openClass);
      container.setAttribute("aria-hidden", "true");
      container.setAttribute("inert", "");
      overlay?.setAttribute("aria-hidden", "true");
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-label", openLabel);
      syncBodyLock();
      if (restoreFocus && lastFocused instanceof HTMLElement) lastFocused.focus();
    }
  }

  function handleKeydown(event) {
    if (!isOpen()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = getFocusable(panel);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener("keydown", handleKeydown);
  return { isOpen, setOpen };
}

function setupOverlays() {
  const menuButton = document.getElementById("hamburger");
  const cartButton = document.getElementById("cart-btn");
  const cart = document.getElementById("cart-sidebar");
  const cartOverlay = document.getElementById("cart-overlay");

  if (cartButton && cart && cartOverlay) {
    cartController = createOverlayController({
      trigger: cartButton,
      container: cart,
      panel: cart,
      overlay: cartOverlay,
      openClass: "open",
      openLabel: text("open_cart", "Open shopping cart"),
      closeLabel: text("close_cart", "Close shopping cart"),
    });
    cartButton.addEventListener("click", () => {
      const open = !cartController.isOpen();
      if (open) {
        if (menuButton?.getAttribute("aria-expanded") === "true") menuButton.click();
        updateCartUI();
      }
      cartController.setOpen(open);
    });
    cartOverlay.addEventListener("click", () => cartController.setOpen(false));
    document.getElementById("cart-close")?.addEventListener("click", () => cartController.setOpen(false));
  }

  menuButton?.addEventListener("click", () => {
    if (menuButton.getAttribute("aria-expanded") === "true") {
      cartController?.setOpen(false, { restoreFocus: false });
    }
  });
}

function regionFromLocale(locale) {
  if (!locale) return null;
  try {
    return typeof Intl.Locale === "function" ? new Intl.Locale(locale).region?.toUpperCase() || null : null;
  } catch (_) {
    return locale.match(/[-_]([A-Z]{2})/i)?.[1]?.toUpperCase() || null;
  }
}

function currencyByRegion(region) {
  if (region === "MY") return "MYR";
  if (region === "CN") return "CNY";
  return "USD";
}

function chooseInitialCurrency({ storedCurrency, activeLocale, browserLocales = [] }) {
  if (SUPPORTED_CURRENCIES.has(storedCurrency)) return storedCurrency;

  const activeRegion = regionFromLocale(activeLocale);
  if (activeRegion === "MY" || activeRegion === "CN") return currencyByRegion(activeRegion);

  for (const locale of browserLocales) {
    const region = regionFromLocale(locale);
    if (region === "MY" || region === "CN") return currencyByRegion(region);
  }
  return "USD";
}

function formatCurrency(amount, currency = userCurrency) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return "—";
  try {
    return new Intl.NumberFormat(document.documentElement.lang || undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch (_) {
    return `${currency} ${numericAmount.toFixed(2)}`;
  }
}

function priceForCurrency(source, currency = userCurrency) {
  const field = currency === "MYR" ? "priceMyr" : currency === "CNY" ? "priceCny" : "priceUsd";
  const amount = Number.parseFloat(source.dataset[field]);
  return { amount: Number.isFinite(amount) ? amount : 0, currency, label: currency };
}

function convertDisplayAmount(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;
  const usd = fromCurrency === "MYR" ? amount / 4.3 : fromCurrency === "CNY" ? amount / 6 : amount;
  if (toCurrency === "MYR") return usd * 4.3;
  if (toCurrency === "CNY") return usd * 6;
  return usd;
}

function updateRegionalPrices() {
  document.querySelectorAll(".js-regional-price").forEach((node) => {
    const price = priceForCurrency(node);
    node.textContent = formatCurrency(price.amount, price.currency);
  });

  const detailPrice = document.getElementById("product-page-price");
  if (detailPrice) {
    const price = priceForCurrency(detailPrice);
    const label = document.getElementById("price-label");
    const buyPrice = document.getElementById("buy-price");
    if (label) label.textContent = price.label;
    if (buyPrice) buyPrice.textContent = formatCurrency(price.amount, price.currency);
  }

  const donateCurrency = document.getElementById("donate-currency");
  if (donateCurrency) donateCurrency.textContent = userCurrency;
  document.querySelectorAll("[data-currency-select]").forEach((select) => {
    select.value = userCurrency;
  });
  updateCartUI();
}

function setupCurrency() {
  const browserLocales = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
  userCurrency = chooseInitialCurrency({
    storedCurrency: safeStorageGet(localStorage, CURRENCY_STORAGE_KEY),
    activeLocale: document.documentElement.lang,
    browserLocales,
  });
  window.userCurrency = userCurrency;

  document.querySelectorAll("[data-currency-select]").forEach((select) => {
    select.value = userCurrency;
    select.addEventListener("change", () => {
      if (!SUPPORTED_CURRENCIES.has(select.value)) return;
      userCurrency = select.value;
      window.userCurrency = userCurrency;
      safeStorageSet(localStorage, CURRENCY_STORAGE_KEY, userCurrency);
      updateRegionalPrices();
    });
  });
  updateRegionalPrices();
}

function normalizeProductId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  const candidate = segments.length ? segments.at(-1) : trimmed;
  if (!candidate) return null;
  if (candidate.startsWith("donate_")) return "donate";
  return /^[a-z0-9][a-z0-9-]{0,63}$/i.test(candidate) ? candidate.toLowerCase() : null;
}

function finitePrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function normalizeCartItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const productId = normalizeProductId(item.productId || item.product_id);
  if (!productId) return null;

  const isDonation = Boolean(item.isDonation) || productId === "donate";
  const donationCurrency = SUPPORTED_CURRENCIES.has(item.donationCurrency)
    ? item.donationCurrency
    : SUPPORTED_CURRENCIES.has(item.currency)
      ? item.currency
      : userCurrency;
  const legacyDonationAmount = finitePrice(item.donationAmount);
  const suppliedMinor = Number.parseInt(item.donationAmountMinor, 10);
  const donationAmountMinor = Number.isSafeInteger(suppliedMinor) && suppliedMinor >= 100
    ? suppliedMinor
    : Math.round(legacyDonationAmount * 100);
  if (isDonation && donationAmountMinor < 100) return null;

  const quantity = isDonation
    ? 1
    : Math.min(MAX_PRODUCT_QUANTITY, Math.max(1, Number.parseInt(item.quantity, 10) || 1));
  const cartId = isDonation ? `donate-${donationCurrency}` : productId;

  return {
    cartId,
    productId: isDonation ? "donate" : productId,
    coins: Math.max(0, Number.parseInt(item.coins, 10) || 0),
    title: typeof item.title === "string" && item.title.trim() ? item.title.trim().slice(0, 120) : "Product",
    image: typeof item.image === "string" && item.image.startsWith("/")
      ? item.image
      : "/assets/img/products/placeholder.png",
    imageWidth: Math.max(1, Number.parseInt(item.imageWidth, 10) || (isDonation ? 1452 : 1408)),
    imageHeight: Math.max(1, Number.parseInt(item.imageHeight, 10) || (isDonation ? 262 : 702)),
    priceUsd: finitePrice(item.priceUsd),
    priceMyr: finitePrice(item.priceMyr),
    priceCny: finitePrice(item.priceCny),
    quantity,
    isDonation,
    donationAmountMinor: isDonation ? donationAmountMinor : undefined,
    donationCurrency: isDonation ? donationCurrency : undefined,
  };
}

function parseCart(raw) {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.map(normalizeCartItem).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function getCart() {
  const current = safeStorageGet(localStorage, CART_STORAGE_KEY);
  if (current !== null) return parseCart(current);

  const legacy = safeStorageGet(localStorage, LEGACY_CART_STORAGE_KEY);
  const migrated = parseCart(legacy);
  safeStorageSet(localStorage, CART_STORAGE_KEY, JSON.stringify(migrated));
  safeStorageRemove(localStorage, LEGACY_CART_STORAGE_KEY);
  return migrated;
}

function saveCart(cart, focusTarget = null) {
  const normalized = cart.map(normalizeCartItem).filter(Boolean);
  safeStorageSet(localStorage, CART_STORAGE_KEY, JSON.stringify(normalized));
  updateCartUI(focusTarget);
}

function getItemPrice(item) {
  if (item.isDonation) {
    const original = item.donationAmountMinor / 100;
    return convertDisplayAmount(original, item.donationCurrency, userCurrency);
  }
  if (userCurrency === "MYR") return item.priceMyr;
  if (userCurrency === "CNY") return item.priceCny;
  return item.priceUsd;
}

function productFromElement(element) {
  return normalizeCartItem({
    productId: element.dataset.productId,
    coins: element.dataset.coins,
    title: element.dataset.title,
    image: element.dataset.image,
    imageWidth: element.dataset.imageWidth,
    imageHeight: element.dataset.imageHeight,
    priceUsd: element.dataset.priceUsd,
    priceMyr: element.dataset.priceMyr,
    priceCny: element.dataset.priceCny,
    quantity: 1,
  });
}

function addProduct(product, feedbackButton) {
  const normalized = normalizeCartItem(product);
  if (!normalized) return;
  const cart = getCart();
  const existing = cart.find((item) => item.cartId === normalized.cartId);
  if (existing?.isDonation) {
    existing.donationAmountMinor += normalized.donationAmountMinor;
    existing.title = normalized.title;
  } else if (existing) {
    existing.quantity = Math.min(MAX_PRODUCT_QUANTITY, existing.quantity + 1);
  } else {
    cart.push(normalized);
  }
  saveCart(cart);
  announce(formatText("item_added", "{title} added to cart.", { title: normalized.title }));

  if (feedbackButton) {
    const original = feedbackButton.textContent;
    feedbackButton.textContent = text("added", "Added! ✓");
    feedbackButton.disabled = true;
    window.setTimeout(() => {
      feedbackButton.textContent = original;
      feedbackButton.disabled = false;
    }, 1600);
  }
}

function removeCartItem(cartId) {
  const cart = getCart();
  const index = cart.findIndex((entry) => entry.cartId === cartId);
  const item = cart[index];
  const next = cart.filter((entry) => entry.cartId !== cartId);
  const fallback = next[Math.min(index, Math.max(0, next.length - 1))];
  saveCart(next, fallback ? { cartId: fallback.cartId, action: "remove" } : { heading: true });
  announce(formatText("item_removed", "{title} removed from cart.", { title: item?.title || "Item" }));
}

function changeCartQuantity(cartId, change) {
  const cart = getCart();
  const item = cart.find((entry) => entry.cartId === cartId);
  if (!item || item.isDonation) return;
  const quantity = Math.min(MAX_PRODUCT_QUANTITY, item.quantity + change);
  if (quantity <= 0) removeCartItem(cartId);
  else {
    item.quantity = quantity;
    saveCart(cart, { cartId, action: change > 0 ? "increase" : "decrease" });
  }
}

function createCartItem(item) {
  const wrapper = document.createElement("article");
  wrapper.className = "cart-item";
  wrapper.dataset.cartId = item.cartId;

  const image = document.createElement("img");
  image.className = "cart-item-img";
  image.src = item.image;
  image.alt = "";
  image.width = item.imageWidth;
  image.height = item.imageHeight;
  image.addEventListener("error", () => {
    image.src = "/assets/img/products/placeholder.png";
  }, { once: true });

  const info = document.createElement("div");
  info.className = "cart-item-info";
  const title = document.createElement("h3");
  title.textContent = item.title;
  const coins = document.createElement("p");
  coins.className = "cart-item-coins";
  coins.textContent = item.coins ? `${item.coins.toLocaleString()} PCoins` : text("support_title", "PWindows Support");
  const price = document.createElement("p");
  price.className = "cart-item-price";
  price.textContent = formatCurrency(getItemPrice(item));
  info.append(title, coins, price);

  const controls = document.createElement("div");
  controls.className = "cart-item-controls";
  if (!item.isDonation) {
    const decrease = document.createElement("button");
    decrease.className = "qty-btn btn";
    decrease.type = "button";
    decrease.textContent = "−";
    decrease.dataset.cartAction = "decrease";
    decrease.dataset.cartId = item.cartId;
    decrease.setAttribute("aria-label", formatText("decrease_quantity", "Decrease {title} quantity", { title: item.title }));
    decrease.addEventListener("click", () => changeCartQuantity(item.cartId, -1));
    const quantity = document.createElement("span");
    quantity.className = "qty-display";
    quantity.textContent = item.quantity;
    quantity.setAttribute("aria-label", formatText("quantity_label", "Quantity {quantity}", { quantity: item.quantity }));
    const increase = document.createElement("button");
    increase.className = "qty-btn btn";
    increase.type = "button";
    increase.textContent = "+";
    increase.disabled = item.quantity >= MAX_PRODUCT_QUANTITY;
    increase.dataset.cartAction = "increase";
    increase.dataset.cartId = item.cartId;
    increase.setAttribute("aria-label", formatText("increase_quantity", "Increase {title} quantity", { title: item.title }));
    increase.addEventListener("click", () => changeCartQuantity(item.cartId, 1));
    controls.append(decrease, quantity, increase);
  }

  const remove = document.createElement("button");
  remove.className = "cart-item-remove btn";
  remove.type = "button";
  remove.textContent = text("remove", "Remove");
  remove.dataset.cartAction = "remove";
  remove.dataset.cartId = item.cartId;
  remove.setAttribute("aria-label", `${text("remove", "Remove")} ${item.title}`);
  remove.addEventListener("click", () => removeCartItem(item.cartId));
  controls.append(remove);

  wrapper.append(image, info, controls);
  return wrapper;
}

function restoreCartFocus(target) {
  if (!target) return;
  window.requestAnimationFrame(() => {
    if (target.heading) {
      const heading = document.getElementById("cart-heading");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus();
      return;
    }
    const selector = `[data-cart-action="${CSS.escape(target.action)}"][data-cart-id="${CSS.escape(target.cartId)}"]`;
    document.querySelector(selector)?.focus();
  });
}

function updateCartUI(focusTarget = null) {
  const count = document.getElementById("cart-count");
  const itemsContainer = document.getElementById("cart-items");
  const subtotalNode = document.getElementById("cart-subtotal");
  const totalNode = document.getElementById("cart-total");
  if (!count || !itemsContainer || !subtotalNode || !totalNode) return;

  const cart = getCart();
  const totalItems = cart.reduce((sum, item) => sum + (item.isDonation ? 1 : item.quantity), 0);
  count.textContent = totalItems;
  count.hidden = totalItems === 0;
  document.getElementById("cart-btn")?.setAttribute(
    "aria-label",
    cartController?.isOpen()
      ? text("close_cart", "Close shopping cart")
      : `${text("open_cart", "Open shopping cart")}${totalItems ? `, ${totalItems} ${text("items", "items")}` : ""}`,
  );

  itemsContainer.replaceChildren();
  if (!cart.length) {
    const empty = document.createElement("p");
    empty.className = "cart-empty";
    empty.textContent = text("empty_cart", "Your cart is empty.");
    itemsContainer.append(empty);
  } else {
    cart.forEach((item) => itemsContainer.append(createCartItem(item)));
  }

  const subtotal = cart.reduce((sum, item) => sum + getItemPrice(item) * item.quantity, 0);
  subtotalNode.textContent = formatCurrency(subtotal);
  totalNode.textContent = formatCurrency(subtotal);
  document.getElementById("cart-discount-row")?.toggleAttribute("hidden", true);
  const checkoutButton = document.getElementById("cart-checkout-btn");
  if (checkoutButton) checkoutButton.disabled = cart.length === 0;
  restoreCartFocus(focusTarget);
}

function setupProductActions() {
  document.querySelectorAll("[data-add-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".grid-item")?.querySelector(".product-card");
      const product = card ? productFromElement(card) : null;
      if (product) addProduct(product, button);
    });
  });

  document.getElementById("buy-btn")?.addEventListener("click", () => {
    const element = document.getElementById("product-page-data");
    const button = document.getElementById("buy-btn");
    const product = element ? productFromElement(element) : null;
    if (!product) return;
    addProduct(product, button);
    cartController?.setOpen(true);
  });

  document.getElementById("donate-add-btn")?.addEventListener("click", () => {
    const input = document.getElementById("donate-amount");
    const amount = Number.parseFloat(input?.value);
    if (!Number.isFinite(amount) || amount < 1) {
      input?.focus();
      announce(text("donation_invalid", "Enter a donation amount of at least one."));
      return;
    }

    addProduct({
      productId: "donate",
      coins: 0,
      title: text("support_title", "Support PWindows"),
      image: "/assets/PWindows.svg",
      imageWidth: 1452,
      imageHeight: 262,
      quantity: 1,
      isDonation: true,
      donationAmountMinor: Math.round(amount * 100),
      donationCurrency: userCurrency,
    }, document.getElementById("donate-add-btn"));
    input.value = "";
  });

  document.getElementById("promo-btn")?.addEventListener("click", () => {
    const input = document.getElementById("promo-input");
    const message = document.getElementById("promo-msg");
    if (!input?.value.trim() || !message) return;
    message.textContent = text("promo_coming_soon", "Promo codes are coming soon.");
  });
}

function setupCatalog() {
  const search = document.getElementById("shop-search");
  const buttons = Array.from(document.querySelectorAll(".cat-btn"));
  const items = Array.from(document.querySelectorAll(".grid-item"));
  if (!search || !buttons.length || !items.length) return;

  const params = new URLSearchParams(window.location.search);
  let category = buttons.some((button) => button.dataset.cat === params.get("category")) ? params.get("category") : "all";
  search.value = params.get("s") || "";

  function filter() {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    items.forEach((item) => {
      const categoryMatch = category === "all" || item.dataset.cat === category;
      const queryMatch = item.dataset.title.includes(query) || item.dataset.desc.includes(query);
      item.hidden = !(categoryMatch && queryMatch);
      if (!item.hidden) visible += 1;
    });
    document.getElementById("no-results").hidden = visible !== 0;
  }

  function syncUrl() {
    const next = new URLSearchParams();
    if (category !== "all") next.set("category", category);
    if (search.value.trim()) next.set("s", search.value.trim());
    history.replaceState(null, "", `${window.location.pathname}${next.size ? `?${next}` : ""}`);
  }

  buttons.forEach((button) => {
    const active = button.dataset.cat === category;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.addEventListener("click", () => {
      category = button.dataset.cat;
      buttons.forEach((candidate) => {
        const selected = candidate === button;
        candidate.classList.toggle("active", selected);
        candidate.setAttribute("aria-pressed", String(selected));
      });
      syncUrl();
      filter();
    });
  });

  search.addEventListener("input", () => {
    syncUrl();
    filter();
  });
  filter();
}

function normalizeUuid(value) {
  if (typeof value !== "string") return null;
  const compact = value.replaceAll("-", "").toLowerCase();
  return PLAYER_UUID_PATTERN.test(compact) ? compact : null;
}

function validatePlayerLookupResponse(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.exists !== "boolean") return null;
  if (!data.exists) return { exists: false };
  if (!PLAYER_NAME_PATTERN.test(data.username || "")) return null;
  const uuid = normalizeUuid(data.uuid);
  if (!uuid) return null;
  if (data.lookup_token !== undefined && (typeof data.lookup_token !== "string" || data.lookup_token.length > 2048)) return null;
  return {
    exists: true,
    username: data.username,
    uuid,
    lookupToken: data.lookup_token || null,
  };
}

function getPlayerLookup() {
  const raw = safeStorageGet(sessionStorage, PLAYER_STORAGE_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw);
    const normalized = validatePlayerLookupResponse({ ...stored, exists: true, lookup_token: stored.lookupToken });
    return normalized?.exists ? normalized : null;
  } catch (_) {
    return null;
  }
}

function savePlayerLookup(player) {
  safeStorageSet(sessionStorage, PLAYER_STORAGE_KEY, JSON.stringify({
    username: player.username,
    uuid: player.uuid,
    lookupToken: player.lookupToken,
  }));
}

function clearLegacyPlayerState() {
  safeStorageRemove(sessionStorage, "pw_username");
  safeStorageRemove(sessionStorage, "pw_uuid");
}

function setupPlayerGate() {
  const form = document.getElementById("gate-form");
  const main = document.getElementById("gate-main");
  const success = document.getElementById("gate-success");
  if (!form || !main || !success) return;

  const input = document.getElementById("gate-username");
  const button = document.getElementById("gate-enter-btn");
  const error = document.getElementById("gate-error");
  const hint = document.getElementById("gate-hint");
  const heading = document.getElementById("gate-title");

  function showLookup(player, moveFocus = false) {
    main.hidden = true;
    success.hidden = false;
    heading.textContent = player.username;
    document.getElementById("gate-avatar").style.backgroundImage = `url("https://crafatar.com/avatars/${encodeURIComponent(player.uuid)}?size=96&overlay")`;
    const redirect = new URLSearchParams(window.location.search).get("redirect");
    const link = document.getElementById("gate-shop-link");
    const safeRedirect = safeShopRedirect(redirect, window.location.origin, shopConfig.languages || []);
    if (link && safeRedirect) link.href = safeRedirect;
    if (moveFocus) window.requestAnimationFrame(() => heading.focus());
  }

  clearLegacyPlayerState();
  const saved = getPlayerLookup();
  if (saved) showLookup(saved);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = input.value.trim();
    error.textContent = "";
    hint.textContent = "";

    if (!PLAYER_NAME_PATTERN.test(username)) {
      error.textContent = username ? text("invalid_username", "Enter a valid Minecraft username.") : text("missing_username", "Please enter your username.");
      input.focus();
      return;
    }

    button.textContent = text("checking", "Checking...");
    button.disabled = true;
    input.disabled = true;
    try {
      const response = await fetch(`https://api.pwindows.qzz.io/shop/login?username=${encodeURIComponent(username)}`, {
        headers: { Accept: "application/json" },
        referrerPolicy: "strict-origin-when-cross-origin",
      });
      if (!response.ok) throw new Error("Player lookup failed");
      const player = validatePlayerLookupResponse(await response.json());
      if (!player) throw new Error("Invalid player lookup response");
      if (!player.exists) {
        error.textContent = text("not_joined", "That player has not joined PWindows yet.");
        hint.textContent = text("join_hint", "Join at play.pwindows.qzz.io first, then come back.");
        return;
      }
      savePlayerLookup(player);
      showLookup(player, true);
      announce(`${player.username}. ${text("lookup_complete", "Player lookup complete. Checkout will revalidate this player.")}`);
    } catch (_) {
      error.textContent = text("lookup_error", "Player lookup is unavailable. Please try again.");
    } finally {
      button.textContent = text("enter_shop", "Look up player");
      button.disabled = false;
      input.disabled = false;
    }
  });
}

function localizedRoot() {
  const lang = document.documentElement.lang;
  return lang && lang !== "en-us" ? `/${lang}/` : "/";
}

function localizedProductsPath() {
  return `${localizedRoot()}products`;
}

function setupPlayerSession({ player: providedPlayer, bypass = developmentBypass, location = window.location } = {}) {
  const pill = document.getElementById("shop-user-pill");
  const productPage = document.getElementById("product-page-data");
  if (!pill && !productPage) return "unused";

  const player = providedPlayer === undefined ? getPlayerLookup() : providedPlayer;
  if (!player) {
    if (pill) pill.hidden = true;
    if (bypass) return "bypass";
    const redirect = encodeURIComponent(location.pathname + location.search);
    location.replace(`${localizedRoot()}?redirect=${redirect}`);
    return "redirect";
  }

  if (pill) {
    pill.hidden = false;
    document.getElementById("shop-user-name").textContent = player.username;
    document.getElementById("shop-user-avatar").style.backgroundImage = `url("https://crafatar.com/avatars/${encodeURIComponent(player.uuid)}?size=34&overlay")`;
    document.getElementById("shop-user-switch")?.addEventListener("click", () => {
      safeStorageRemove(sessionStorage, PLAYER_STORAGE_KEY);
      window.location.assign(localizedRoot());
    });
  }
  return "player";
}

function applyPromoToCart() {
  const input = document.getElementById("cart-promo-input");
  const message = document.getElementById("cart-promo-msg");
  const code = input?.value.trim().toUpperCase();
  if (!message) return;
  if (!code) {
    message.textContent = "";
    return;
  }
  safeStorageSet(localStorage, PROMO_STORAGE_KEY, code);
  message.textContent = text("promo_saved", "Promo code saved for checkout.");
  announce(text("promo_saved", "Promo code saved for checkout."));
}

function buildCheckoutPayload(cart, player, requestedCurrency, promoCode) {
  const validatedPlayer = validatePlayerLookupResponse({
    exists: true,
    username: player?.username,
    uuid: player?.uuid,
    lookup_token: player?.lookupToken,
  });
  if (!validatedPlayer?.exists) throw new TypeError("A validated player lookup is required");
  if (!SUPPORTED_CURRENCIES.has(requestedCurrency)) throw new TypeError("Unsupported checkout currency");
  const normalizedCart = Array.isArray(cart) ? cart.map(normalizeCartItem).filter(Boolean) : [];
  return {
    requested_currency: requestedCurrency,
    player: {
      username: validatedPlayer.username,
      uuid: validatedPlayer.uuid,
      ...(validatedPlayer.lookupToken ? { lookup_token: validatedPlayer.lookupToken } : {}),
    },
    items: normalizedCart.filter((item) => !item.isDonation).map((item) => ({
      product_id: item.productId,
      quantity: Math.min(MAX_PRODUCT_QUANTITY, Math.max(1, item.quantity)),
    })),
    donations: normalizedCart.filter((item) => item.isDonation).map((item) => ({
      amount_minor: item.donationAmountMinor,
      currency: item.donationCurrency,
    })),
    ...(promoCode ? { promo_code: promoCode } : {}),
  };
}

function isAllowedCheckoutUrl(value, allowedHosts) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && allowedHosts.includes(url.hostname);
  } catch (_) {
    return false;
  }
}

async function checkoutFromCart() {
  const cart = getCart();
  const player = getPlayerLookup();
  if (!player) {
    announce(text("checkout_requires_player", "Complete a player lookup before checkout."));
    window.location.assign(`${localizedRoot()}?redirect=${encodeURIComponent(localizedProductsPath())}`);
    return;
  }
  if (!cart.length) {
    announce(text("empty_cart", "Your cart is empty."));
    return;
  }

  const button = document.getElementById("cart-checkout-btn");
  button.disabled = true;
  button.textContent = text("processing", "Processing...");
  const endpoint = shopConfig.checkoutEndpoint;
  if (endpoint === "https://your-worker.example.com/create-checkout") {
    announce(text("checkout_placeholder", "Checkout is coming soon."));
    button.disabled = false;
    button.textContent = text("checkout", "Proceed to Checkout");
    return;
  }

  try {
    const payload = buildCheckoutPayload(cart, player, userCurrency, safeStorageGet(localStorage, PROMO_STORAGE_KEY));
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    if (!response.ok) throw new Error("Checkout failed");
    const session = await response.json();
    if (!session || typeof session !== "object" || !isAllowedCheckoutUrl(session.session_url, shopConfig.checkoutAllowedHosts || [])) {
      throw new Error("Checkout returned an invalid destination");
    }
    window.location.assign(session.session_url);
  } catch (error) {
    console.error("Checkout could not start", error);
    announce(text("checkout_error", "Checkout could not start."));
    button.disabled = false;
    button.textContent = text("checkout", "Proceed to Checkout");
  }
}

function setupImageFallbacks() {
  document.querySelectorAll("img[data-fallback-src]").forEach((image) => {
    image.addEventListener("error", () => {
      image.src = image.dataset.fallbackSrc;
    }, { once: true });
  });
}

function initializeShop() {
  shopStrings = parseJsonScript("shop-i18n", {});
  shopConfig = parseJsonScript("shop-config", shopConfig);
  developmentBypass = configureDevelopmentBypass({
    hostname: window.location.hostname,
    search: window.location.search,
    storage: sessionStorage,
  });
  const developmentNotice = document.getElementById("development-notice");
  if (developmentNotice) developmentNotice.hidden = !developmentBypass;
  setupCurrency();
  setupOverlays();
  setupImageFallbacks();
  setupPlayerGate();
  setupPlayerSession();
  setupCatalog();
  setupProductActions();
  document.getElementById("cart-promo-btn")?.addEventListener("click", applyPromoToCart);
  document.getElementById("cart-checkout-btn")?.addEventListener("click", checkoutFromCart);
  updateCartUI();
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initializeShop);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
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
  };
}
