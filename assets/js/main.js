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

function detectRegion() {
    const locales = [navigator.language, ...(navigator.languages || [])].filter(Boolean);

    for (const locale of locales) {
        try {
            if (typeof Intl.Locale === 'function') {
                const region = new Intl.Locale(locale).region;
                if (region) return region.toUpperCase();
            }
        } catch (_) {
        }

        const match = locale.match(/[-_]([a-z]{2})$/i);
        if (match) return match[1].toUpperCase();
    }

    return 'US';
}

function currencyByRegion(region) {
    if (region === 'MY') return 'MYR';
    if (region === 'CN') return 'CNY';
    if (region === 'GB') return 'GBP';
    if (region === 'JP') return 'JPY';
    if (region === 'KR') return 'KRW';
    if (region === 'IN') return 'INR';
    if (region === 'AU') return 'AUD';
    if (region === 'CA') return 'CAD';
    if (region === 'NZ') return 'NZD';
    if (EUR_REGIONS.has(region)) return 'EUR';
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
    if (!priceNodes.length) return;

    const region = detectRegion();
    const targetCurrency = currencyByRegion(region);
    const usePresetMyr = region === 'MY';
    const usePresetCny = region === 'CN';

    let usdToTargetRate = 1;
    if (!usePresetMyr && !usePresetCny && targetCurrency !== 'USD') {
        const ratePayload = await getUsdRates();
        const rates = ratePayload && ratePayload.rates ? ratePayload.rates : null;
        if (rates && typeof rates[targetCurrency] === 'number') {
            usdToTargetRate = rates[targetCurrency];
        } else {
            usdToTargetRate = null;
        }
    }

    priceNodes.forEach(node => {
        const usd = parseFloat(node.dataset.priceUsd);
        const myr = parseFloat(node.dataset.priceMyr);
        const cny = parseFloat(node.dataset.priceCny);

        let amount = usd;
        let currency = 'USD';

        if (usePresetMyr && Number.isFinite(myr)) {
            amount = myr;
            currency = 'MYR';
        } else if (usePresetCny && Number.isFinite(cny)) {
            amount = cny;
            currency = 'CNY';
        } else if (Number.isFinite(usd) && usdToTargetRate && targetCurrency !== 'USD') {
            amount = usd * usdToTargetRate;
            currency = targetCurrency;
        }

        if (Number.isFinite(amount)) {
            node.textContent = formatCurrency(amount, currency);
        }
    });
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
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
        if (e.key === 'Escape' && mobileMenu && mobileMenu.classList.contains('active')) {
            closeMenu();
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
