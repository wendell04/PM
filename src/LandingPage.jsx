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

      {/* MARQUEE */}
      <div className="marquee-strip">
        <div className="marquee-track">
          {[
            'Silk Screen Printing', 'Digital Printing Shirt', 'Keychains', 'Eco Bags',
            'Folded Fan Printing', 'Business Cards', 'Paper Bags', 'Kraft Bag',
            'Mugs', 'Tumbler', 'Sticker Labels', 'Giveaways', 'Birthday Invitations', 'Personalized Calendars',
            'Silk Screen Printing', 'Digital Printing Shirt', 'Keychains', 'Eco Bags',
            'Folded Fan Printing', 'Business Cards', 'Paper Bags', 'Kraft Bag',
            'Mugs', 'Tumbler', 'Sticker Labels', 'Giveaways', 'Birthday Invitations', 'Personalized Calendars'
          ].map((item, i) => (
            <div className="marquee-item" key={i}>
              <span className="marquee-dot"></span>{item}
            </div>
          ))}
        </div>
      </div>

      {/* SERVICES */}
      <section id="services">
        <div className="container">
          <div className="section-header center">
            <span className="section-tag">What We Offer</span>
            <h2 className="section-title">Our <span className="gold-text">Print</span> Services</h2>
            <p className="section-subtitle">
              From apparel to promotional materials — we bring your ideas to life
              with precision printing at prices that won't break the bank.
            </p>
          </div>
          <div className="services-grid">
            {[
              { icon: '🖨️', title: 'Silk Screen Printing', desc: "Premium silk screen printing for bulk shirts and apparel. Vibrant, long-lasting colors that won't fade.", color: 'red' },
              { icon: '👕', title: 'Digital Printing Shirt', desc: 'Full-color digital prints directly on shirts. Perfect for detailed designs, photos, and small quantities.', color: 'gold' },
              { icon: '🔑', title: 'Keychains', desc: 'Custom printed or engraved keychains — great for giveaways, souvenirs, and personalized gifts.', color: 'red' },
              { icon: '🛍️', title: 'Eco Bags', desc: 'Personalized eco-friendly bags for events, businesses, and everyday use. Stylish and sustainable.', color: 'gold' },
              { icon: '🪭', title: 'Folded Fan Printing', desc: 'Custom printed folded fans — ideal for outdoor events, weddings, and promotional campaigns.', color: 'red' },
              { icon: '💼', title: 'Business Cards', desc: 'Professional business cards printed with sharp detail. Make a lasting first impression every time.', color: 'gold' },
              { icon: '🛍️', title: 'Paper Bags', desc: 'Branded paper bags for your business or events. Clean, professional, and customizable in any size.', color: 'red' },
              { icon: '🎒', title: 'Kraft Bag', desc: 'Eco-friendly kraft bags with your custom print. Perfect for packaging, retail, and giveaways.', color: 'gold' },
              { icon: '☕', title: 'Mugs', desc: 'Personalized mugs for gifts, corporate giveaways, or personal use. Full-wrap printing available.', color: 'red' },
              { icon: '🥤', title: 'Tumbler', desc: 'Custom printed tumblers — keep drinks hot or cold in style with your own personalized design.', color: 'gold' },
              { icon: '🏷️', title: 'Sticker Labels', desc: 'Die-cut and custom sticker labels for products, packaging, events, and personal branding.', color: 'red' },
              { icon: '🎁', title: 'Giveaways', desc: 'Complete personalized giveaway packages for events, birthdays, and corporate occasions.', color: 'gold' },
              { icon: '🎉', title: 'Birthday Invitations', desc: 'Beautifully designed and printed birthday invitations. Custom layouts to match your theme.', color: 'red' },
              { icon: '📅', title: 'Personalized Calendars', desc: 'Custom calendars with your photos and branding. Perfect for year-round gifts and promotions.', color: 'gold' },
            ].map((s, i) => (
              <div className="service-card fade-up" key={i}>
                <div className="service-icon" style={s.color === 'red'
                  ? { background: 'rgba(196,30,58,.12)', border: '1px solid rgba(196,30,58,.25)' }
                  : { background: 'rgba(212,168,67,.1)', border: '1px solid rgba(212,168,67,.25)' }
                }>{s.icon}</div>
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
                  <path d="M3 8h10M9 4l4 4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>  
                </svg> 
              </button>
              <a href="#sservices" className="btn-secondary">View Services</a> 
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <a href="#" className="nav-logo" style={{ display: 'inline-flex', marginBottom: '.25rem' }}>
                <img
                  src="/logos/PersonalizeMe logo.png"
                  alt="Personalize Me Prints"
                  className="nav-logo-mark"
                />
                <div className="nav-logo-text" style={{ marginLeft: '.75rem' }}>
                  PERSONALIZE <span>ME</span><br />PRINTS
                </div>
              </a>
              <p>Printing quality at affordable rates. We bring your ideas to life with precision and care.</p>
              <div className="social-links">
                <a href="#" className="social-btn" aria-label="Facebook">f</a>
                <a href="#" className="social-btn" aria-label="Instagram">📷</a>
                <a href="#" className="social-btn" aria-label="TikTok">♪</a>
                <a href="#" className="social-btn" aria-label="Shopee">🛍️</a>
              </div>
            </div>
            <div className="footer-col">
              <h4>Services</h4>
              <ul>
                <li><a href="#">Silk Screen Printing</a></li>
                <li><a href="#">Digital Printing Shirt</a></li>
                <li><a href="#">Keychains</a></li>
                <li><a href="#">Eco Bags</a></li>
                <li><a href="#">Folded Fan Printing</a></li>
                <li><a href="#">Business Cards</a></li>
                <li><a href="#">Paper Bags</a></li>
                <li><a href="#">Kraft Bag</a></li>
                <li><a href="#">Mugs</a></li>
                <li><a href="#">Tumbler</a></li>
                <li><a href="#">Sticker Labels</a></li>
                <li><a href="#">Giveaways</a></li>
                <li><a href="#">Birthday Invitations</a></li>
                <li><a href="#">Personalized Calendars</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Company</h4>
              <ul>
                <li><a href="#">About Us</a></li>
                <li><a href="#">How It Works</a></li>
                <li><a href="#">Portfolio</a></li>
                <li><a href="#">Pricing</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Support</h4>
              <ul>
                <li><a href="#">Contact Us</a></li>
                <li><a href="#">Track Order</a></li>
                <li><a href="#">FAQ</a></li>
                <li><a href="#">Privacy Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© 2025 Personalize ME Prints. All rights reserved.</p>
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