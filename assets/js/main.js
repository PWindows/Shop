// Logo click functionality with bounce animation
function goHome() {
    const logo = document.getElementById('logo');
    if (!logo) return;
    
    logo.style.animation = 'bounce 0.6s ease-in-out';

    setTimeout(() => {
        logo.style.animation = '';
    }, 600);

    // Navigate to index page instead of #home
    window.location.href = 'https://shop.pwindows.qzz.io/';
}

function goBack() {
    const logo = document.getElementById('logo');
    if (!logo) return;
    
    logo.style.animation = 'bounce 0.6s ease-in-out';

    setTimeout(() => {
        logo.style.animation = '';
    }, 600);

    // Navigate to index page instead of #home
    window.location.href = 'https://www.pwindows.qzz.io/';
}

// Hamburger Menu Functionality
function toggleMenu() {
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobileMenu');
    const body = document.body;
    
    if (hamburger && mobileMenu) {
        hamburger.classList.toggle('active');
        mobileMenu.classList.toggle('active');
        body.classList.toggle('menu-open');
    }
}

function closeMenu() {
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobileMenu');
    const body = document.body;
    
    if (hamburger && mobileMenu) {
        hamburger.classList.remove('active');
        mobileMenu.classList.remove('active');
        body.classList.remove('menu-open');
    }
}

// Enhanced copy IP functionality
function copyIP() {
    const ip = 'Play.PWindows.qzz.io';
    const button = document.querySelector('.server-info');
    if (!button) return;

    navigator.clipboard.writeText(ip).then(function () {
        button.classList.add('copied');

        setTimeout(() => {
            button.classList.remove('copied');
        }, 2000);
    }).catch(function (err) {
        console.error('Failed to copy IP: ', err);
        const textArea = document.createElement('textarea');
        textArea.value = ip;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);

        button.classList.add('copied');
        setTimeout(() => {
            button.classList.remove('copied');
        }, 2000);
    });
}

// Copy server IP from flip card button
function copyServerIP(button) {
    const ip = 'Play.PWindows.qzz.io';

    navigator.clipboard.writeText(ip).then(function () {
        button.classList.add('copied');

        setTimeout(() => {
            button.classList.remove('copied');
        }, 2000);
    }).catch(function (err) {
        console.error('Failed to copy IP: ', err);
        const textArea = document.createElement('textarea');
        textArea.value = ip;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);

        button.classList.add('copied');
        setTimeout(() => {
            button.classList.remove('copied');
        }, 2000);
    });
}

const EUR_REGIONS = new Set([
    'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR',
    'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'
]);

let usdRatesPromise = null;

let locationPromise = null;

function getLocationFromIP() {
    if (!locationPromise) {
        locationPromise = fetch('https://ipapi.co/json/')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && data.country_code) {
                    console.log('IP Geolocation country:', data.country_code);
                    return data.country_code.toUpperCase();
                }
                return null;
            })
            .catch(err => {
                console.error('Geolocation API error:', err);
                return null;
            });
    }
    return locationPromise;
}

function detectRegion() {
    // This will be overridden by IP geolocation
    // Fallback to browser language only if geolocation fails
    const browserLang = navigator.language || navigator.userLanguage || '';
    const allLangs = [browserLang, ...(navigator.languages || [])].filter(Boolean);

    for (const locale of allLangs) {
        try {
            if (typeof Intl.Locale === 'function') {
                const intlLocale = new Intl.Locale(locale);
                const region = intlLocale.region;
                if (region) return region.toUpperCase();
            }
        } catch (e) {}

        const match = locale.match(/[-_]([A-Z]{2})/i);
        if (match) return match[1].toUpperCase();
    }

    return 'US';
}

function currencyByRegion(region) {
    if (region === 'MY') return 'MYR';
    if (region === 'CN') return 'CNY';
    return 'USD';
}

function formatCurrency(amount, currency) {
    const noDecimalCurrencies = new Set(['JPY', 'KRW']);
    const digits = noDecimalCurrencies.has(currency) ? 0 : 2;

    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            minimumFractionDigits: digits,
            maximumFractionDigits: digits
        }).format(amount);
    } catch (_) {
        return `$${Number(amount).toFixed(2)}`;
    }
}

function getUsdRates() {
    if (!usdRatesPromise) {
        usdRatesPromise = fetch('https://open.er-api.com/v6/latest/USD')
            .then(res => res.ok ? res.json() : null)
            .catch(() => null);
    }
    return usdRatesPromise;
}

async function initRegionalPrices() {
    const priceNodes = document.querySelectorAll('.js-regional-price');
    console.log('Found price nodes:', priceNodes.length);

    if (!priceNodes.length) return;

    // Get region from IP geolocation first, fallback to browser language
    let region = await getLocationFromIP();
    if (!region) {
        region = detectRegion();
        console.log('IP geolocation failed, using browser language fallback:', region);
    } else {
        console.log('Using IP geolocation region:', region);
    }

    const usePresetMyr = region === 'MY';
    const usePresetCny = region === 'CN';

    console.log('Detected region:', region);
    console.log('Use MYR?', usePresetMyr);
    console.log('Use CNY?', usePresetCny);

    // Store region for cart calculations
    window.userRegion = region;
    window.userCurrency = currencyByRegion(region);

    console.log('User currency:', window.userCurrency);

    priceNodes.forEach((node, idx) => {
        const usd = parseFloat(node.dataset.priceUsd);
        const myr = parseFloat(node.dataset.priceMyr);
        const cny = parseFloat(node.dataset.priceCny);

        console.log(`Node ${idx}: USD=${usd}, MYR=${myr}, CNY=${cny}`);

        let amount = usd;
        let currency = 'USD';

        if (usePresetMyr && Number.isFinite(myr)) {
            amount = myr;
            currency = 'MYR';
        } else if (usePresetCny && Number.isFinite(cny)) {
            amount = cny;
            currency = 'CNY';
        }

        if (Number.isFinite(amount)) {
            const formatted = formatCurrency(amount, currency);
            console.log(`Setting node ${idx} to: ${formatted}`);
            node.textContent = formatted;
        }
    });
}

// Shopping Cart Management
const CART_STORAGE_KEY = 'pwindows_cart';
const PROMO_STORAGE_KEY = 'pwindows_promo';

function getCart() {
    const cart = localStorage.getItem(CART_STORAGE_KEY);
    return cart ? JSON.parse(cart) : [];
}

function saveCart(cart) {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    updateCartUI();
}

function addToCart(btnElement) {
    // Find the product card from the button's parent grid-item
    const gridItem = btnElement.closest('.grid-item');
    if (!gridItem) {
        console.error('Could not find grid-item');
        return;
    }

    const productElement = gridItem.querySelector('.product-card');
    if (!productElement) {
        console.error('Could not find product-card');
        return;
    }

    const productId = productElement.dataset.productId;
    const coins = parseInt(productElement.dataset.coins) || 0;
    const title = productElement.dataset.title || 'Unknown';
    const image = productElement.dataset.image || '/assets/img/products/placeholder.png';
    const stripeId = productElement.dataset.stripeId || '';
    const priceUsd = parseFloat(productElement.dataset.priceUsd) || 0;
    const priceMyr = parseFloat(productElement.dataset.priceMyr) || 0;
    const priceCny = parseFloat(productElement.dataset.priceCny) || 0;

    const cart = getCart();

    // Check if product already in cart
    const existing = cart.find(item => item.productId === productId);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({
            productId,
            coins,
            title,
            image,
            stripeId,
            priceUsd,
            priceMyr,
            priceCny,
            quantity: 1
        });
    }

    saveCart(cart);

    // Show feedback
    const original = btnElement.textContent;
    btnElement.textContent = 'Added! ✓';
    setTimeout(() => { btnElement.textContent = original; }, 2000);
}

function removeFromCart(productId) {
    let cart = getCart();
    cart = cart.filter(item => item.productId !== productId);
    saveCart(cart);
}

function updateCartItemQuantity(productId, quantity) {
    let cart = getCart();
    const item = cart.find(item => item.productId === productId);
    if (item) {
        if (quantity <= 0) {
            removeFromCart(productId);
        } else {
            item.quantity = quantity;
            saveCart(cart);
        }
    }
}

function getPrice(item) {
    if (window.userRegion === 'MY') return item.priceMyr;
    if (window.userRegion === 'CN') return item.priceCny;
    return item.priceUsd;
}

function updateCartUI() {
    const cart = getCart();
    const cartCount = document.getElementById('cart-count');
    const cartItemsDiv = document.getElementById('cart-items');
    const cartSubtotal = document.getElementById('cart-subtotal');
    const cartTotal = document.getElementById('cart-total');

    // Update count
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (totalItems > 0) {
        cartCount.textContent = totalItems;
        cartCount.style.display = 'flex';
    } else {
        cartCount.style.display = 'none';
    }

    // Update items display
    if (cart.length === 0) {
        cartItemsDiv.innerHTML = '<p style="text-align:center; color:#888; padding:2rem; font-size:0.9rem;">Your cart is empty</p>';
    } else {
        cartItemsDiv.innerHTML = cart.map(item => `
            <div class="cart-item">
                <img src="${item.image}" alt="${item.title}" class="cart-item-img" onerror="this.src='/assets/img/products/placeholder.png'" />
                <div class="cart-item-info">
                    <h4>${item.title}</h4>
                    <p class="cart-item-coins">${item.coins} PCoins</p>
                    <p class="cart-item-price">${formatCurrency(getPrice(item), window.userCurrency || 'USD')}</p>
                </div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="updateCartItemQuantity('${item.productId}', ${item.quantity - 1})">−</button>
                    <span class="qty-display">${item.quantity}</span>
                    <button class="qty-btn" onclick="updateCartItemQuantity('${item.productId}', ${item.quantity + 1})">+</button>
                    <button class="cart-item-remove" onclick="removeFromCart('${item.productId}')">🗑</button>
                </div>
            </div>
        `).join('');
    }

    // Update totals
    const subtotal = cart.reduce((sum, item) => sum + (getPrice(item) * item.quantity), 0);
    const promoCode = localStorage.getItem(PROMO_STORAGE_KEY);
    let discount = 0;
    let discountPercent = 0;

    // TODO: Get discount from Stripe or your backend
    // For now, store the promo code to send to Stripe later
    if (promoCode) {
        // You'll validate this when creating the Stripe session
    }

    const total = subtotal - discount;
    cartSubtotal.textContent = formatCurrency(subtotal, window.userCurrency || 'USD');
    cartTotal.textContent = formatCurrency(total, window.userCurrency || 'USD');

    if (discount > 0) {
        document.getElementById('cart-discount-row').style.display = 'flex';
        document.getElementById('cart-discount').textContent = formatCurrency(discount, window.userCurrency || 'USD');
    } else {
        document.getElementById('cart-discount-row').style.display = 'none';
    }
}

function toggleCart() {
    const sidebar = document.getElementById('cart-sidebar');
    const overlay = document.getElementById('cart-overlay');
    const isOpen = sidebar.classList.contains('open');

    if (isOpen) {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    } else {
        sidebar.classList.add('open');
        overlay.classList.add('open');
        updateCartUI();
    }
}

function applyPromoToCart() {
    const input = document.getElementById('cart-promo-input');
    const msg = document.getElementById('cart-promo-msg');
    const code = input.value.trim().toUpperCase();

    if (!code) {
        msg.textContent = '';
        return;
    }

    msg.style.color = '#888';
    msg.textContent = 'Validating...';

    // TODO: Validate promo code via Stripe API or your backend
    // For now, just store it to send to Stripe during checkout
    localStorage.setItem(PROMO_STORAGE_KEY, code);

    setTimeout(() => {
        msg.style.color = '#27ae60';
        msg.textContent = `Promo code "${code}" applied!`;
        updateCartUI();
    }, 600);
}

async function checkoutFromCart() {
    const cart = getCart();
    const uuid = sessionStorage.getItem('pw_uuid');
    const username = sessionStorage.getItem('pw_username');

    if (!uuid || !username) {
        window.location.href = '/?redirect=/products';
        return;
    }

    if (cart.length === 0) {
        alert('Your cart is empty!');
        return;
    }

    const btn = document.getElementById('cart-checkout-btn');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
        const promoCode = localStorage.getItem(PROMO_STORAGE_KEY);
        const region = window.userRegion || 'US';

        // Prepare cart data for Stripe
        const checkoutData = {
            items: cart.map(item => ({
                stripe_price_id: item.stripeId,
                quantity: item.quantity,
                name: item.title,
                amount: getPrice(item),
                currency: window.userCurrency
            })),
            player_uuid: uuid,
            username: username,
            promo: promoCode,
            region: region
        };

        console.log('Sending to checkout:', checkoutData);

        // TODO: Replace with your actual Cloudflare Worker URL
        const response = await fetch('https://your-worker.example.com/create-checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(checkoutData)
        });

        if (!response.ok) {
            throw new Error('Checkout failed');
        }

        const session = await response.json();

        if (session.session_url) {
            // Redirect to Stripe checkout
            window.location.href = session.session_url;
        } else if (session.error) {
            alert('Error: ' + session.error);
        }
    } catch (e) {
        console.error('Checkout error:', e);
        alert('Checkout error. Please try again.\n\nError: ' + e.message);
        btn.disabled = false;
        btn.textContent = 'Proceed to Checkout';
    }
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize regional pricing
    initRegionalPrices();

    // Initialize cart UI
    updateCartUI();

    // Setup hamburger menu
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobileMenu');

    if (hamburger) {
        hamburger.addEventListener('click', toggleMenu);
    }

    // Close menu when clicking outside
    if (mobileMenu) {
        mobileMenu.addEventListener('click', function (e) {
            if (e.target === mobileMenu) {
                closeMenu();
            }
        });
    }

    // Close menu on escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (mobileMenu && mobileMenu.classList.contains('active')) {
                closeMenu();
            }
            const cartSidebar = document.getElementById('cart-sidebar');
            if (cartSidebar && cartSidebar.classList.contains('open')) {
                toggleCart();
            }
        }
    });

    // Handle window resize
    window.addEventListener('resize', function () {
        if (window.innerWidth > 768 && mobileMenu && mobileMenu.classList.contains('active')) {
            closeMenu();
        }
    });

    // Enhanced smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Hero card hover effects (optimized with transform only)
    const heroCard = document.querySelector('.hero-card');
    if (heroCard) {
        heroCard.addEventListener('mouseenter', function () {
            this.style.transform = 'translateY(-5px)';
        });

        heroCard.addEventListener('mouseleave', function () {
            this.style.transform = 'translateY(0)';
        });
    }

    // Scroll animations (optimized with IntersectionObserver)
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target); // Stop observing once animated
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '50px'
    });

    document.querySelectorAll('.hero-card, .server-info, .launch-btn').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        observer.observe(el);
    });
});
