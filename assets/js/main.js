// Logo click functionality with bounce animation
function goHome() {
    const logo = document.getElementById('logo');
    if (!logo) return;
    
    logo.style.animation = 'bounce 0.6s ease-in-out';

    setTimeout(() => {
        logo.style.animation = '';
    }, 600);

    // Navigate to index page instead of #home
    goTo('/');
}

function goToAbsolute(path) {
  // Ensure path starts with a slash
  if (!path.startsWith('/')) {
    path = '/' + path;
  }

  // Build a full absolute URL
  const absoluteUrl = `${window.location.protocol}//${window.location.host}${path}`;

  // Force a hard reload from the server (bypasses SPA routing & <base> tag)
  window.location.replace(absoluteUrl);
}


function aboutPage() {
  goTo('about'); // works even without leading slash
}

function newsPage() {
  goTo('articles');
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
