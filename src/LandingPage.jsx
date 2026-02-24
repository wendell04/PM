import React, { useState, useEffect } from 'react';
import './custom-styles.css';

const LandingPage = ({onEnterShop}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [modal, setModal] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);


  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.12 }
    );
    document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = document.getElementById('particles');
    if (!container) return;
    const colors = ['#d4a843', '#e8c76a', '#c41e3a', 'rgba(245,245,245,0.6)'];
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const s = Math.random() * 5 + 2;
      const c = colors[Math.floor(Math.random() * colors.length)];
      p.style.cssText = `
        width:${s}px; height:${s}px;
        left:${Math.random() * 90 + 5}%;
        bottom:${Math.random() * 30 + 10}%;
        background:${c};
        box-shadow:0 0 ${s * 2}px ${c};
        animation-duration:${Math.random() * 4 + 3}s;
        animation-delay:${Math.random() * 6}s;
      `;
      container.appendChild(p);
    }
  }, []);

  useEffect(() => {
    document.body.style.overflow = modal ? 'hidden' : '';
    return () => {document.body.style.overflow = '';};
  }, [modal]);

  const openModal = (type) => {
    setModal(type);
    setMobileMenuOpen(false);
  };

  const closeModal = () => setModal(null);

  const closeMobile = () => {
    setMobileMenuOpen(false);
    document.body.style.overflow = '';
  };

  const toggleMobile = () => {
    const next = !mobileMenuOpen;
    setMobileMenuOpen(next);
    document.body.style.overflow = next ? 'hidden' : '';
  };

  return (
    <>
      {/* NAVBAR */}
      <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="container">
          <div className="nav-inner">

            <a href="#" className="nav-logo">
              <img
                src="/logos/PersonalizeMe logo.png"
                alt="Personalize Me Prints"
                className="nav-logo-mark"
              />
              <div className="nav-logo-text">
                PERSONALIZE <span>ME</span><br />PRINTS
              </div>
            </a>

            <ul className="nav-links">
              <li><a href="#services">Services</a></li>
              <li><a href="#how-it-works">How It Works</a></li>
              <li><a href="#why-us">Why Us</a></li>
            </ul>

            <div className="nav-auth">
              <button className="btn-nav-login" onClick={() => openModal('login')}>Login</button>
              <button className="btn-nav-register" onClick={() => openModal('register')}>Register</button>
            </div>

            <button
              className={`hamburger ${mobileMenuOpen ? 'open' : ''}`}
              onClick={toggleMobile}
              aria-label="Menu"
            >
              <span></span><span></span><span></span>
            </button>

          </div>
        </div>
      </nav>

      {/* MOBILE MENU */}
      <div className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
        <a href="#services" onClick={closeMobile}>Services</a>
        <a href="#how-it-works" onClick={closeMobile}>How It Works</a>
        <a href="#why-us" onClick={closeMobile}>Why Us</a>
        <div className="mobile-auth-btns">
          <button className="btn-nav-login" onClick={() => openModal('login')}>Login</button>
          <button className="btn-nav-register" onClick={() => openModal('register')}>Register</button>
        </div>
      </div>

      {/* HERO */}
      <section className="hero" id="home">
        <div className="hero-content">
          <div className="hero-badge">Premium Custom Printing</div>
          <h1 className="hero-title">
            Print What<br />
            <span className="red-text">Represents</span>
            <span className="gold-text"> You</span>
          </h1>
          <p className="hero-subtitle">
            High-quality personalized printing for t-shirts, mugs, souvenirs, and more.
            Upload your design — we'll make it real. Fast, affordable, and built to impress.
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={onEnterShop}>
              Browse Products
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <a href="#how-it-works" className="btn-secondary">How It Works</a>
          </div>
          <div className="hero-stats">
            <div>
              <div className="hero-stat-num gold-text">500+</div>
              <div className="hero-stat-label">Happy Clients</div>
            </div>
            <div>
              <div className="hero-stat-num gold-text">24hr</div>
              <div className="hero-stat-label">Turnaround</div>
            </div>
            <div>
              <div className="hero-stat-num gold-text">100%</div>
              <div className="hero-stat-label">Satisfaction</div>
            </div>
          </div>
        </div>

        {/* LOGO VISUAL */}
        <div className="hero-visual">
          <div className="logo-3d-scene">
            <div className="particles" id="particles"></div>
            <div className="ring-outer"></div>
            <div className="ring-mid"></div>
            <div className="orbit" style={{ animationDuration: '7s' }}>
              <div className="orbit-dot" style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--gold)', boxShadow: '0 0 8px var(--gold)' }}></div>
            </div>
            <div className="orbit" style={{ animationDuration: '10s', animationDirection: 'reverse', transform: 'rotate(120deg)' }}>
              <div className="orbit-dot" style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--red)', boxShadow: '0 0 8px var(--red)' }}></div>
            </div>
            <div className="orbit" style={{ animationDuration: '13s', transform: 'rotate(240deg)' }}>
              <div className="orbit-dot" style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--gold-light)', boxShadow: '0 0 6px var(--gold-light)' }}></div>
            </div>
            <img
              src="/logos/PersonalizeMe logo.png"
              alt="Personalize Me Prints Logo"
              className="hero-logo-img"
            />
            <div className="logo-glow"></div>
          </div>
        </div>
      </section>

      { /* SERVICE CAROUSEL */ }
      <section id="services">
        <div className="container">
          <div className="section-header center">
            <span className="section-tag">What We Offer</span>
            <h2 className="section-title">Our<span className="gold-text">Print</span>Sevices</h2>
            <p className="section-subtitle">
              From apparel to promotional materials — we bring your ideas to life
              with precision printing at prices that won't break the bank.
            </p>
          </div>
        </div>

      <div className="services-carousel-wrapper">
        <div className="services-carousel-track">
          {[
            {img: '/products/Tshit_printing.jpg', title: 'T-Shirt Printing', desc: 'Starts at ₱300. Final cost depends on quantity, design, material, and panel print.'},
            {img: '/products/DTF.jpg', title: 'DTF Printing', desc: 'Starts at ₱250 per meter. Final cost depends on quantity.'},
            {img: '/products/mugs.jpg', title: 'Mugs (11oz)', desc: 'Ceramic White, Inner Color Mug & Magic Mug. Starting at ₱50/pc for bulk orders.'},
            {img: '/products/ButtonPins.jpg', title: 'Button Pins & Badges', desc: 'Badge/Button Pin, Magnet Badge & Keychain Badge variants. Bulk pricing available.'},
            {img: '/products/ecobags.jpg', title: 'Eco Bags / Totebag', desc: 'Plain & w/ Zipper and Pocket. Small, Medium, and Large sizes available.'},
            {img: '/products/MousePad.jpg', title: 'Mousepad', desc: 'Rectangle 22x18cm. Starting at ₱70/pc for 501-1000 pcs.'},
            {img: '/products/RefMagnet.jpg', title: 'Ref Magnet', desc: 'Maximum size 3". Starting at ₱15/pc for 501-1000 pcs.'},
            {img: '/products/Souvenirs.jpg', title: 'Souvenirs', desc: 'Custom souvenir items for weddings, birthdays, corporate events, and giveaways.'},
            {img: '/products/Stickers.jpg', title: 'Stickers & Labels', desc: 'Vinyl, Specialty, Photopaper, Regular & Kraft variants. Kisscut & Diecut available.'},
            {img: '/products/BookMarks.jpg', title: 'Magnetic Bookmark', desc: 'Maximum size 2.5". Starting at ₱15/pc for 501-1000 pcs.'},
            {img: '/products/Ballpens.jpg', title: 'Ballpens', desc: 'Custom printed ballpens — practical and affordable promotional giveaway items.'},
            {img: '/products/caps.jpg', title: 'Caps', desc: 'Custom printed or embroidered caps. Perfect for teams, events, and merchandise.'},

            {img: '/products/Tshit_printing.jpg', title: 'T-Shirt Printing', desc: 'Starts at ₱300. Final cost depends on quantity, design, material, and panel print.'},
            {img: '/products/DTF.jpg', title: 'DTF Printing', desc: 'Starts at ₱250 per meter. Final cost depends on quantity.'},
            {img: '/products/mugs.jpg', title: 'Mugs (11oz)', desc: 'Ceramic White, Inner Color Mug & Magic Mug. Starting at ₱50/pc for bulk orders.'},
            {img: '/products/ButtonPins.jpg', title: 'Button Pins & Badges', desc: 'Badge/Button Pin, Magnet Badge & Keychain Badge variants. Bulk pricing available.'},
            {img: '/products/ecobags.jpg', title: 'Eco Bags / Totebag', desc: 'Plain & w/ Zipper and Pocket. Small, Medium, and Large sizes available.'},
            {img: '/products/MousePad.jpg', title: 'Mousepad', desc: 'Rectangle 22x18cm. Starting at ₱70/pc for 501-1000 pcs.'},
            {img: '/products/RefMagnet.jpg', title: 'Ref Magnet', desc: 'Maximum size 3". Starting at ₱15/pc for 501-1000 pcs.'},
            {img: '/products/Souvenirs.jpg', title: 'Souvenirs', desc: 'Custom souvenir items for weddings, birthdays, corporate events, and giveaways.'},
            {img: '/products/Stickers.jpg', title: 'Stickers & Labels', desc: 'Vinyl, Specialty, Photopaper, Regular & Kraft variants. Kisscut & Diecut available.'},
            {img: '/products/BookMarks.jpg', title: 'Magnetic Bookmark', desc: 'Maximum size 2.5". Starting at ₱15/pc for 501-1000 pcs.'},
            {img: '/products/Ballpens.jpg', title: 'Ballpens', desc: 'Custom printed ballpens — practical and affordable promotional giveaway items.'},
            {img: '/products/caps.jpg', title: 'Caps', desc: 'Custom printed or embroidered caps. Perfect for teams, events, and merchandise.'},
          ].map((s, i) => (
            <div className="service-slide" key={i}>
              <div className="service-slide-img-wrap">
                <img src={s.img} alt={s.title} className="service-slide-img"/>
              </div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
        ))}
        </div>
      </div>
    </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="how-bg">
        <div className="container">
          <div className="section-header center">
            <span className="section-tag">Simple Process</span>
            <h2 className="section-title">How It <span className="red-text">Works</span></h2>
            <p className="section-subtitle">
              Getting your custom prints is fast and hassle-free.
              Just follow these simple steps and we'll handle the rest.
            </p>
          </div>
          <div className="steps-grid">
            {[
              { n: '1', title: 'Choose a Product', desc: 'Browse our catalog and pick what you want — t-shirts, mugs, stickers, or more.' },
              { n: '2', title: 'Upload Your Design', desc: 'Upload your artwork or describe what you want. No design? We can help you create one.' },
              { n: '3', title: 'Review & Approve', desc: "We'll send you a proof. Confirm the design placement and details before we print." },
              { n: '4', title: 'Get Your Order', desc: 'Once approved, we print and deliver — fast, fresh, exactly as you imagined.' },
            ].map((s, i) => (
              <div className="step-card fade-up" key={i}>
                <div className="step-num">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY US */}
      <section id="why-us">
        <div className="container">
          <div className="features-layout">
            <div>
              <div className="section-header">
                <span className="section-tag">Why Choose Us</span>
                <h2 className="section-title">Quality You Can <span className="gold-text">Feel</span></h2>
                <p className="section-subtitle">
                  We're not just a print shop — we're your creative partner.
                  Every order is handled with care, precision, and pride.
                </p>
              </div>
              <div className="feature-list">
                {[
                  { title: 'Affordable Pricing', desc: 'Premium prints at prices that make sense. No hidden fees, no overpricing.' },
                  { title: 'Fast Turnaround', desc: 'Most orders ready within 24–48 hours. Rush orders? We can make it work.' },
                  { title: 'Design Assistance', desc: 'No designer? No problem. Request a design and our team will create it for you.' },
                  { title: 'Approval Before Print', desc: 'You see and approve the final design before we print — 100% satisfaction guaranteed.' },
                ].map((f, i) => (
                  <div className="feature-item fade-up" key={i}>
                    <div className="feature-check">✓</div>
                    <div>
                      <h4>{f.title}</h4>
                      <p>{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="feature-visual">
              <div className="feature-card-stack">
                <div className="fcard">
                  <div className="fcard-inner">
                    <div className="fcard-label">Total Orders</div>
                    <div className="fcard-value gold-text">1,240+</div>
                    <div className="fcard-bar"><div className="fcard-bar-fill" style={{ width: '82%', background: 'linear-gradient(90deg,var(--gold-dark),var(--gold))' }}></div></div>
                  </div>
                </div>
                <div className="fcard">
                  <div className="fcard-inner">
                    <div className="fcard-label">Satisfaction Rate</div>
                    <div className="fcard-value red-text">98.5%</div>
                    <div className="fcard-bar"><div className="fcard-bar-fill" style={{ width: '98%', background: 'linear-gradient(90deg,var(--red-dark),var(--red))' }}></div></div>
                  </div>
                </div>
                <div className="fcard">
                  <div className="fcard-inner">
                    <div className="fcard-label">Avg. Delivery</div>
                    <div className="fcard-value gold-text">24 hrs</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--gray)', marginTop: '.5rem' }}>Rush orders available</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="container">
          <div className="cta-banner fade-up">
            <h2>Ready to <span className="red-text">Personalize</span> Something?</h2>
            <p>Whether it's a shirt for your team or a gift for someone special — we're here to print it perfectly.</p>
            <div className="cta-actions">
              <button className="btn-primary" onClick={onEnterShop}>
                Browse Products
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>  
                </svg> 
              </button>
              <a href="#sservices" className="btn-secondary">View Services</a> 
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container">
          <div className="footer-top">
            <a href="#" className="nav-logo">
              <img src="/logos/PersonalizeMe logo.png" alt="Personalize Me Prints" className="nav-logo-mark"/>
                <div className="nav-logo-text">
                  PERSONALIZE<span>ME</span><br/>PRINTS
                </div>
            </a>
            <nav className="footer-nav">
              <a href="#services">Services</a>
              <a href="#how-it-works">How It Works</a>
              <a href="#why-us">Why Us</a>
              <a href="#">Pricing</a>
              <a href="#">Contact</a>
            </nav>
            <div className="social-links">
              <a href="https://www.facebook.com/share/1Mks4kwnhZ/?mibextid=wwXIfr" className="social-btn" aria-label="Facebook" target="_blank" rel="noopener noreferrer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                </svg>
              </a>

              <a href="https://www.instagram.com/personalizmeprints" className="social-btn" aria-label="Instagram" target="_blank" rel="noopener noreferrer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
                </svg>
              </a>

              <a href="https://tiktok.com/@personalizemeprints" className="social-btn" aria-label="TikTok" target="_blank" rel="noopener noreferrer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/>
                </svg>
              </a>

              <a href="https://shopee.ph/personalizemeprints" className="social-btn" aria-label="Shopee" target="_blank" rel="noopener noreferrer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0a4.187 4.187 0 0 0-4.187 4.187H4.6L3.128 21.428A1.2 1.2 0 0 0 4.324 22.8h15.352a1.2 1.2 0 0 0 1.196-1.372L19.4 4.187h-3.213A4.187 4.187 0 0 0 12 0zm0 1.714a2.473 2.473 0 0 1 2.473 2.473H9.527A2.473 2.473 0 0 1 12 1.714zm0 8.572c-2.58 0-4.286 1.34-4.286 3.257 0 3.78 6.566 3.164 6.566 5.143 0 .779-.771 1.114-1.617 1.114-1.44 0-1.989-.771-2.074-1.714H8.674c.086 1.8 1.269 3.086 3.241 3.343V22.8h1.543v-1.389c2.006-.3 3.113-1.457 3.113-3.086 0-3.814-6.566-3.129-6.566-5.143 0-.686.6-1.071 1.457-1.071 1.2 0 1.714.557 1.8 1.5h1.886c-.129-1.629-1.157-2.786-3-3.086v-1.37h-1.543v1.37c-.343.043-.686.129-1.029.257z"/>
                </svg>
              </a>
            </div>
          </div>

          <div className="footer-bottom">
              <p>© 2024 Personalize ME Prints. All rights reserved.</p>
              <div className="footer-legal">
                <a href="#">Privacy Policy</a>
                <a href="#">Terms of Service</a>
              </div>
            </div>
        </div>
      </footer>

      {/* AUTH MODAL */}
      {modal && (
        <div className="auth-overlay" onClick={closeModal}>
          <div className="auth-modal" onClick={e => e.stopPropagation()}>

      {/* LOGIN */}
      {modal === 'login' && (
        <>
          <div className="auth-modal-header">
            <img src="/logos/PersonalizeMe logo.png" alt="Logo" className="auth-modal-logo" />
            <div><h2>Welcome Back!</h2><p>Login to your Account</p></div>
            <button className="auth-close" onClick={closeModal}>✕</button>
          </div>
          <div className="auth-modal-body">
            <button className="btn-google">
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
              Continue with Google
            </button>
            <div className="auth-divider"><span>or Login with email</span></div>
            <div className="auth-field">
              <label>Email Address</label>
              <input type="email" placeholder="you@example.com" />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <div className="auth-input-wrap">
                <input type={showPassword ? 'text' : 'password'} placeholder="Enter your password" />
                <button className="auth-eye" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <div className="auth-row">
              <label className="auth-check"><input type="checkbox" /><span>Remember Me</span></label>
              <a href="#" className="auth-link">Forgot Password</a>
            </div>
            <button className="btn-auth-submit">Sign In</button>
            <p className="auth-switch">Don't have an account? <button onClick={() => setModal('register')}>Create one</button></p>
          </div>
        </>
      )}

      {/* REGISTER */}
      {modal === 'register' && (
        <>
          <div className="auth-modal-header">
            <img src="/logos/PersonalizeMe logo.png" alt="Logo" className="auth-modal-logo" />
            <div><h2>Create Account</h2><p>Join Personalize Me Prints</p></div>
            <button className="auth-close" onClick={closeModal}>✕</button>
          </div>
          <div className="auth-modal-body">
            <button className="btn-google">
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
              Continue with Google
            </button>
            <div className="auth-divider"><span>or register with email</span></div>
            <div className="auth-fields-grid">
              <div className="auth-field">
                <label>Full Name</label>
                <input type="text" placeholder="Juan Dela Cruz" />
              </div>
              <div className="auth-field">
                <label>Phone Number</label>
                <input type="tel" placeholder="+63 912 345 6789" />
              </div>
            </div>
            <div className="auth-field">
              <label>Email Address</label>
              <input type="email" placeholder="you@example.com" />
            </div>
            <div className="auth-fields-grid">
              <div className="auth-field">
                <label>Password</label>
                <div className="auth-input-wrap">
                  <input type={showPassword ? 'text' : 'password'} placeholder="Create Password" />
                  <button className="auth-eye" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <div className="auth-field">
                <label>Confirm Password</label>
                <div className="auth-input-wrap">
                  <input type={showConfirm ? 'text' : 'password'} placeholder="Repeat Password" />
                  <button className="auth-eye" onClick={() => setShowConfirm(!showConfirm)}>
                    {showConfirm ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            </div>
            <label className="auth-check auth-terms">
              <input type="checkbox" />
              <span>I agree to the <a href="#" className="auth-link">Terms of Service</a> and <a href="#" className="auth-link">Privacy Policy</a></span>
            </label>
            <button className="btn-auth-submit">Create Account</button>
            <p className="auth-switch">Already have an account? <button onClick={() => setModal('login')}>Sign In</button></p>
          </div>
        </>
      )}

    </div>
  </div>
)}
    </>
  );
};

export default LandingPage;