const CART_STORAGE_KEY = "pwindows_cart";
const PROMO_STORAGE_KEY = "pwindows_promo";

let userRegion = "US";
let userCurrency = "USD";
let cartController;
let locationPromise;

function announce(message) {
  const status = document.getElementById("site-status");
  if (!status) return;
  status.textContent = "";
  window.requestAnimationFrame(() => {
    status.textContent = message;
  });
}

function getFocusable(container) {
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function syncBodyLock() {
  document.body.classList.toggle("overlay-open", Boolean(cartController?.isOpen()));
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
      if (moveFocus) window.requestAnimationFrame(() => getFocusable(panel)[0]?.focus());
    } else {
      container.classList.remove(openClass);
      overlay?.classList.remove(openClass);
      container.setAttribute("aria-hidden", "true");
      container.setAttribute("inert", "");
      overlay?.setAttribute("aria-hidden", "true");
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-label", openLabel);
      if (restoreFocus && lastFocused instanceof HTMLElement) lastFocused.focus();
    }

    syncBodyLock();
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
      openLabel: "Open shopping cart",
      closeLabel: "Close shopping cart",
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

function getLocationFromIP() {
  if (!locationPromise) {
    locationPromise = fetch("https://ipapi.co/json/")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data?.country_code?.toUpperCase() || null)
      .catch(() => null);
  }
  return locationPromise;
}

function detectRegion() {
  const locales = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
  for (const locale of locales) {
    try {
      const region = typeof Intl.Locale === "function" ? new Intl.Locale(locale).region : null;
      if (region) return region.toUpperCase();
    } catch (_) {
      const match = locale.match(/[-_]([A-Z]{2})/i);
      if (match) return match[1].toUpperCase();
    }
  }
  return "US";
}

function currencyByRegion(region) {
  if (region === "MY") return "MYR";
  if (region === "CN") return "CNY";
  return "USD";
}

function formatCurrency(amount, currency = userCurrency) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch (_) {
    return `$${numericAmount.toFixed(2)}`;
  }
}

function priceForRegion(source) {
  const usd = Number.parseFloat(source.dataset.priceUsd);
  const myr = Number.parseFloat(source.dataset.priceMyr);
  const cny = Number.parseFloat(source.dataset.priceCny);
  if (userRegion === "MY" && Number.isFinite(myr)) return { amount: myr, currency: "MYR", label: "Malaysia" };
  if (userRegion === "CN" && Number.isFinite(cny)) return { amount: cny, currency: "CNY", label: "China" };
  return { amount: usd, currency: "USD", label: "USD" };
}

async function initRegionalPrices() {
  userRegion = (await getLocationFromIP()) || detectRegion();
  userCurrency = currencyByRegion(userRegion);
  window.userRegion = userRegion;
  window.userCurrency = userCurrency;

  document.querySelectorAll(".js-regional-price").forEach((node) => {
    const price = priceForRegion(node);
    node.textContent = formatCurrency(price.amount, price.currency);
  });

  const detailPrice = document.getElementById("product-page-price");
  if (detailPrice) {
    const price = priceForRegion(detailPrice);
    const label = document.getElementById("price-label");
    const buyPrice = document.getElementById("buy-price");
    if (label) label.textContent = price.label;
    if (buyPrice) buyPrice.textContent = formatCurrency(price.amount, price.currency);
  }

  const donateCurrency = document.getElementById("donate-currency");
  if (donateCurrency) donateCurrency.textContent = userCurrency === "MYR" ? "RM" : userCurrency === "CNY" ? "¥" : "$";
  updateCartUI();
}

function getCart() {
  try {
    const value = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  updateCartUI();
}

function getItemPrice(item) {
  if (userRegion === "MY") return Number(item.priceMyr) || 0;
  if (userRegion === "CN") return Number(item.priceCny) || 0;
  return Number(item.priceUsd) || 0;
}

function productFromElement(element) {
  return {
    productId: element.dataset.productId,
    coins: Number.parseInt(element.dataset.coins, 10) || 0,
    title: element.dataset.title || "Product",
    image: element.dataset.image || "/assets/img/products/placeholder.png",
    stripeId: element.dataset.stripeId || "",
    priceUsd: Number.parseFloat(element.dataset.priceUsd) || 0,
    priceMyr: Number.parseFloat(element.dataset.priceMyr) || 0,
    priceCny: Number.parseFloat(element.dataset.priceCny) || 0,
    quantity: 1,
  };
}

function addProduct(product, feedbackButton) {
  const cart = getCart();
  const existing = cart.find((item) => item.productId === product.productId);
  if (existing) existing.quantity += 1;
  else cart.push(product);
  saveCart(cart);
  announce(`${product.title} added to cart.`);

  if (feedbackButton) {
    const original = feedbackButton.textContent;
    feedbackButton.textContent = "Added! ✓";
    feedbackButton.disabled = true;
    window.setTimeout(() => {
      feedbackButton.textContent = original;
      feedbackButton.disabled = false;
    }, 1600);
  }
}

function removeCartItem(productId) {
  const item = getCart().find((entry) => entry.productId === productId);
  saveCart(getCart().filter((entry) => entry.productId !== productId));
  announce(`${item?.title || "Item"} removed from cart.`);
}

function changeCartQuantity(productId, change) {
  const cart = getCart();
  const item = cart.find((entry) => entry.productId === productId);
  if (!item) return;
  item.quantity += change;
  if (item.quantity <= 0) removeCartItem(productId);
  else saveCart(cart);
}

function createCartItem(item) {
  const wrapper = document.createElement("article");
  wrapper.className = "cart-item";

  const image = document.createElement("img");
  image.className = "cart-item-img";
  image.src = item.image;
  image.alt = "";
  image.addEventListener("error", () => {
    image.src = "/assets/img/products/placeholder.png";
  }, { once: true });

  const info = document.createElement("div");
  info.className = "cart-item-info";
  const title = document.createElement("h3");
  title.textContent = item.title;
  const coins = document.createElement("p");
  coins.className = "cart-item-coins";
  coins.textContent = item.coins ? `${item.coins.toLocaleString()} PCoins` : "PWindows Support";
  const price = document.createElement("p");
  price.className = "cart-item-price";
  price.textContent = formatCurrency(getItemPrice(item));
  info.append(title, coins, price);

  const controls = document.createElement("div");
  controls.className = "cart-item-controls";
  const decrease = document.createElement("button");
  decrease.className = "qty-btn btn";
  decrease.type = "button";
  decrease.textContent = "−";
  decrease.setAttribute("aria-label", `Decrease ${item.title} quantity`);
  decrease.addEventListener("click", () => changeCartQuantity(item.productId, -1));
  const quantity = document.createElement("span");
  quantity.className = "qty-display";
  quantity.textContent = item.quantity;
  quantity.setAttribute("aria-label", `Quantity ${item.quantity}`);
  const increase = document.createElement("button");
  increase.className = "qty-btn btn";
  increase.type = "button";
  increase.textContent = "+";
  increase.setAttribute("aria-label", `Increase ${item.title} quantity`);
  increase.addEventListener("click", () => changeCartQuantity(item.productId, 1));
  const remove = document.createElement("button");
  remove.className = "cart-item-remove btn";
  remove.type = "button";
  remove.textContent = "Remove";
  remove.setAttribute("aria-label", `Remove ${item.title} from cart`);
  remove.addEventListener("click", () => removeCartItem(item.productId));
  controls.append(decrease, quantity, increase, remove);

  wrapper.append(image, info, controls);
  return wrapper;
}

function updateCartUI() {
  const count = document.getElementById("cart-count");
  const itemsContainer = document.getElementById("cart-items");
  const subtotalNode = document.getElementById("cart-subtotal");
  const totalNode = document.getElementById("cart-total");
  if (!count || !itemsContainer || !subtotalNode || !totalNode) return;

  const cart = getCart();
  const totalItems = cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  count.textContent = totalItems;
  count.hidden = totalItems === 0;
  const cartLabel = cartController?.isOpen()
    ? "Close shopping cart"
    : totalItems
      ? `Open shopping cart, ${totalItems} items`
      : "Open shopping cart";
  document.getElementById("cart-btn")?.setAttribute("aria-label", cartLabel);

  itemsContainer.replaceChildren();
  if (!cart.length) {
    const empty = document.createElement("p");
    empty.className = "cart-empty";
    empty.textContent = "Your cart is empty.";
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
}

function setupProductActions() {
  document.querySelectorAll("[data-add-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".grid-item")?.querySelector(".product-card");
      if (card) addProduct(productFromElement(card), button);
    });
  });

  document.getElementById("buy-btn")?.addEventListener("click", () => {
    const product = document.getElementById("product-page-data");
    const button = document.getElementById("buy-btn");
    if (!product) return;
    addProduct(productFromElement(product), button);
    cartController?.setOpen(true);
  });

  document.getElementById("donate-add-btn")?.addEventListener("click", () => {
    const input = document.getElementById("donate-amount");
    const amount = Number.parseFloat(input?.value);
    if (!Number.isFinite(amount) || amount < 1) {
      input?.focus();
      announce("Enter a donation amount of at least one.");
      return;
    }

    const baseUsd = userCurrency === "USD" ? amount : userCurrency === "MYR" ? amount / 4.3 : amount / 6;
    const product = {
      productId: `donate_${Date.now()}`,
      coins: 0,
      title: `Support PWindows — ${formatCurrency(amount)}`,
      image: "/assets/PWindows.svg",
      stripeId: "donate",
      priceUsd: userCurrency === "USD" ? amount : baseUsd,
      priceMyr: userCurrency === "MYR" ? amount : baseUsd * 4.3,
      priceCny: userCurrency === "CNY" ? amount : baseUsd * 6,
      quantity: 1,
      isDonation: true,
      donationAmount: amount,
    };
    addProduct(product, document.getElementById("donate-add-btn"));
    input.value = "";
  });

  document.getElementById("promo-btn")?.addEventListener("click", () => {
    const input = document.getElementById("promo-input");
    const message = document.getElementById("promo-msg");
    if (!input?.value.trim() || !message) return;
    message.textContent = "Checking code...";
    window.setTimeout(() => {
      message.textContent = "Promo codes are coming soon.";
    }, 500);
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

function setupPlayerGate() {
  const form = document.getElementById("gate-form");
  const main = document.getElementById("gate-main");
  const success = document.getElementById("gate-success");
  if (!form || !main || !success) return;

  const input = document.getElementById("gate-username");
  const button = document.getElementById("gate-enter-btn");
  const error = document.getElementById("gate-error");
  const hint = document.getElementById("gate-hint");

  function showVerified(username, uuid) {
    main.hidden = true;
    success.hidden = false;
    document.getElementById("gate-welcome").textContent = `Hey, ${username}!`;
    document.getElementById("gate-avatar").style.backgroundImage = `url("https://crafatar.com/avatars/${encodeURIComponent(uuid)}?size=96&overlay")`;
    const redirect = new URLSearchParams(window.location.search).get("redirect");
    const link = document.getElementById("gate-shop-link");
    if (link && redirect?.startsWith("/") && !redirect.startsWith("//")) link.href = redirect;
  }

  const savedUsername = sessionStorage.getItem("pw_username");
  const savedUuid = sessionStorage.getItem("pw_uuid");
  if (savedUsername && savedUuid) showVerified(savedUsername, savedUuid);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = input.value.trim();
    error.textContent = "";
    hint.textContent = "";

    if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
      error.textContent = username ? "Enter a valid Minecraft username." : "Please enter your username.";
      input.focus();
      return;
    }

    button.textContent = "Checking...";
    button.disabled = true;
    input.disabled = true;
    try {
      const response = await fetch(`https://api.pwindows.qzz.io/shop/login?username=${encodeURIComponent(username)}`);
      if (!response.ok) throw new Error("Verification request failed");
      const data = await response.json();
      if (!data.exists) {
        error.textContent = "You haven’t joined PWindows yet!";
        hint.textContent = "Join at play.pwindows.qzz.io first, then come back.";
        return;
      }
      sessionStorage.setItem("pw_username", data.username);
      sessionStorage.setItem("pw_uuid", data.uuid);
      showVerified(data.username, data.uuid);
      announce(`Welcome, ${data.username}. Player verified.`);
    } catch (_) {
      error.textContent = "Something went wrong. Please try again.";
    } finally {
      button.textContent = "Enter Shop";
      button.disabled = false;
      input.disabled = false;
    }
  });
}

function setupPlayerSession() {
  const pill = document.getElementById("shop-user-pill");
  const productPage = document.getElementById("product-page-data");
  if (!pill && !productPage) return;

  const username = sessionStorage.getItem("pw_username");
  const uuid = sessionStorage.getItem("pw_uuid");
  if (!username || !uuid) {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/?redirect=${redirect}`);
    return;
  }

  if (pill) {
    pill.hidden = false;
    document.getElementById("shop-user-name").textContent = username;
    document.getElementById("shop-user-avatar").style.backgroundImage = `url("https://crafatar.com/avatars/${encodeURIComponent(uuid)}?size=34&overlay")`;
    document.getElementById("shop-user-switch")?.addEventListener("click", () => {
      sessionStorage.removeItem("pw_username");
      sessionStorage.removeItem("pw_uuid");
      window.location.assign("/");
    });
  }
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
  message.textContent = "Validating...";
  localStorage.setItem(PROMO_STORAGE_KEY, code);
  window.setTimeout(() => {
    message.textContent = `Promo code “${code}” saved for checkout.`;
    announce("Promo code saved for checkout.");
  }, 500);
}

async function checkoutFromCart() {
  const cart = getCart();
  const uuid = sessionStorage.getItem("pw_uuid");
  const username = sessionStorage.getItem("pw_username");
  if (!uuid || !username) {
    window.location.assign("/?redirect=/products");
    return;
  }
  if (!cart.length) {
    announce("Your cart is empty.");
    return;
  }

  const button = document.getElementById("cart-checkout-btn");
  button.disabled = true;
  button.textContent = "Processing...";
  try {
    const response = await fetch("https://your-worker.example.com/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.map((item) => ({
          stripe_price_id: item.stripeId,
          quantity: item.quantity,
          name: item.title,
          amount: getItemPrice(item),
          currency: userCurrency,
        })),
        player_uuid: uuid,
        username,
        promo: localStorage.getItem(PROMO_STORAGE_KEY),
        region: userRegion,
      }),
    });
    if (!response.ok) throw new Error("Checkout failed");
    const session = await response.json();
    if (session.session_url) window.location.assign(session.session_url);
    else throw new Error(session.error || "Checkout session was not created");
  } catch (error) {
    announce(`Checkout could not start. ${error.message}`);
    button.disabled = false;
    button.textContent = "Proceed to Checkout";
  }
}

function setupImageFallbacks() {
  document.querySelectorAll("img[data-fallback-src]").forEach((image) => {
    image.addEventListener("error", () => {
      image.src = image.dataset.fallbackSrc;
    }, { once: true });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupOverlays();
  setupImageFallbacks();
  setupPlayerGate();
  setupPlayerSession();
  setupCatalog();
  setupProductActions();
  document.getElementById("cart-promo-btn")?.addEventListener("click", applyPromoToCart);
  document.getElementById("cart-checkout-btn")?.addEventListener("click", checkoutFromCart);
  updateCartUI();
  await initRegionalPrices();
});
