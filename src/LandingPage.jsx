import React, { useState } from 'react';
import './custom-styles.css';

const LandingPage = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);

  // Sample services data
  const services = [
    {
      id: 1,
      title: "Custom T-Shirts",
      description: "High-quality custom t-shirts with your designs printed to perfection.",
      icon: "TS"
    },
    {
      id: 2,
      title: "Corporate Giveaways",
      description: "Branded merchandise for your business events and marketing campaigns.",
      icon: "CG"
    },
    {
      id: 3,
      title: "Personalized Gifts",
      description: "Unique personalized gifts for special occasions and celebrations.",
      icon: "PG"
    },
    {
      id: 4,
      title: "Mugs & Drinkware",
      description: "Custom mugs, tumblers, and drinkware for personal or promotional use.",
      icon: "MD"
    },
    {
      id: 5,
      title: "Bags & Accessories",
      description: "Personalized bags, backpacks, and accessories for everyday use.",
      icon: "BA"
    },
    {
      id: 6,
      title: "Signage & Banners",
      description: "Professional signage and banners for businesses and events.",
      icon: "SB"
    }
  ];

  // Sample products data
  const products = [
    {
      id: 1,
      title: "Premium Cotton T-Shirt",
      price: "₱299",
      image: "/placeholder-product.jpg"
    },
    {
      id: 2,
      title: "Custom Ceramic Mug",
      price: "₱199",
      image: "/placeholder-product.jpg"
    },
    {
      id: 3,
      title: "Personalized Canvas Bag",
      price: "₱499",
      image: "/placeholder-product.jpg"
    },
    {
      id: 4,
      title: "Custom Phone Case",
      price: "₱399",
      image: "/placeholder-product.jpg"
    },
    {
      id: 5,
      title: "Personalized Notebook",
      price: "₱249",
      image: "/placeholder-product.jpg"
    },
    {
      id: 6,
      title: "Custom Keychain",
      price: "₱99",
      image: "/placeholder-product.jpg"
    }
  ];

  // Login Modal Component
  const LoginModal = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
      e.preventDefault();
      // Simple validation
      if (!email || !password) {
        setError('Please fill in all fields');
        return;
      }
      
      // Simulate login process
      console.log('Login attempt with:', { email, password });
      // Close modal after successful login
      setShowLoginModal(false);
      // In a real app, you would redirect to dashboard
    };

    if (!showLoginModal) return null;

    return (
      <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Login to Your Account</h2>
            <button className="close-btn" onClick={() => setShowLoginModal(false)}>✕</button>
          </div>
          <form onSubmit={handleSubmit} className="modal-form">
            {error && <div className="error-message">{error}</div>}
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="modal-input"
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="modal-input"
                placeholder="••••••••"
                required
              />
            </div>
            <div className="form-options">
              <label className="checkbox-label">
                <input type="checkbox" /> Remember me
              </label>
              <a href="#" className="forgot-password">Forgot password?</a>
            </div>
            <button type="submit" className="submit-btn">Sign In</button>
          </form>
          <div className="modal-footer">
            <p>Don't have an account? <button onClick={() => { setShowLoginModal(false); setShowSignupModal(true); }} className="switch-form">Sign Up</button></p>
          </div>
        </div>
      </div>
    );
  };

  // Signup Modal Component
  const SignupModal = () => {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [error, setError] = useState('');
    const [otp, setOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [showOTPInput, setShowOTPInput] = useState(false);
    const [countdown, setCountdown] = useState(0);

    const handleSubmit = (e) => {
      e.preventDefault();
      
      if (!phoneNumber || !otp) {
        setError('Please enter phone number and verify OTP');
        return;
      }
      
      // Simulate signup process after OTP verification
      console.log('Signup attempt with:', { phoneNumber, otp });
      // Close modal after successful signup
      setShowSignupModal(false);
      // In a real app, you would redirect to profile setup
    };

    const handleSendOTP = () => {
      if (!phoneNumber) {
        setError('Please enter a phone number');
        return;
      }

      // Simulate sending OTP
      console.log(`Sending OTP to ${phoneNumber}`);
      setOtpSent(true);
      setShowOTPInput(true);
      setError('');
      
      // Start countdown for resend
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };

    const handleVerifyOTP = () => {
      if (!otp) {
        setError('Please enter the OTP');
        return;
      }

      // Simulate OTP verification
      console.log(`Verifying OTP: ${otp}`);
      setError('');
      // In a real app, you would verify the OTP with the backend
      // Then redirect to profile setup page
      alert('Phone number verified! You would be redirected to profile setup.');
      setShowSignupModal(false);
    };

    const handleResendOTP = () => {
      if (countdown > 0) return; // Prevent resending during cooldown
      
      // Reset and send new OTP
      setOtp('');
      setOtpSent(false);
      setTimeout(() => {
        handleSendOTP();
      }, 100);
    };

    if (!showSignupModal) return null;

    return (
      <div className="modal-overlay" onClick={() => setShowSignupModal(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Create Account</h2>
            <button className="close-btn" onClick={() => setShowSignupModal(false)}>✕</button>
          </div>
          <form onSubmit={handleSubmit} className="modal-form">
            {error && <div className="error-message">{error}</div>}
            <div className="form-group">
              <label htmlFor="phoneNumber">Phone Number</label>
              <div className="phone-input-wrapper">
                <input
                  type="tel"
                  id="phoneNumber"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="modal-input"
                  placeholder="+63 912 345 6789"
                  required
                />
                <button
                  type="button"
                  onClick={handleSendOTP}
                  disabled={otpSent || !phoneNumber}
                  className={`send-otp-btn ${
                    otpSent || !phoneNumber
                      ? 'disabled'
                      : ''
                  }`}
                >
                  {otpSent ? 'Sent!' : 'Send OTP'}
                </button>
              </div>
            </div>

            {showOTPInput && (
              <div className="form-group">
                <label htmlFor="otp">Enter OTP</label>
                <input
                  type="text"
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="modal-input"
                  placeholder="Enter 6-digit code"
                  required
                />
                <button
                  type="button"
                  onClick={handleVerifyOTP}
                  className="verify-otp-btn"
                >
                  Verify OTP
                </button>
              </div>
            )}

            <div className="form-agreement text-center">
              <p className="text-sm text-gray-700">
                By signing up, you agree to PersonalizeMe's <a href="#" className="text-green-600 hover:underline font-medium">Terms of Service</a> & <a href="#" className="text-green-600 hover:underline font-medium">Privacy Policy</a>
              </p>
            </div>
            <button type="submit" className="submit-btn">Continue</button>
          </form>
          
          {/* Google Signup Option */}
          <div className="modal-divider-section">
            <div className="divider-line"></div>
            <div className="divider-text">Or continue with</div>
            <div className="divider-line"></div>
          </div>
          
          <button 
            className="google-signup-btn"
            onClick={() => {
              console.log('Google signup initiated');
              // In a real app, this would redirect to Google OAuth
              // Then redirect to profile setup page
              alert('Google signup initiated! You would be redirected to profile setup.');
              setShowSignupModal(false);
            }}
          >
            <svg className="google-icon" viewBox="0 0 24 24">
              <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z" fill="#4285F4"/>
            </svg>
            Sign up with Google
          </button>
          
          <div className="modal-footer">
            <p>Already have an account? <button onClick={() => { setShowSignupModal(false); setShowLoginModal(true); }} className="switch-form">Login</button></p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="landing-page">
      {/* Header */}
      <header className="header">
        <div className="container">
          <nav className="navbar">
            <a href="/" className="logo">
              Personalize<span className="gold">Me</span>
            </a>

            <button
              className="hamburger"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>

            <ul className={`nav-links ${mobileMenuOpen ? 'active' : ''}`}>
              <li><a href="#home">Home</a></li>
              <li><a href="#services">Services</a></li>

              {/* Products with dropdown */}
              <li className="dropdown-products">
                <a href="#products" className="dropbtn-products">Products</a>
                <div className="dropdown-content-products">
                  <a href="#">Ballpens</a>
                  <a href="#">Bookmarks</a>
                  <a href="#">Button Pins</a>
                  <a href="#">Caps</a>
                  <a href="#">Mugs</a>
                  <a href="#">Magnet</a>

                  <a href="#">Bags</a>
                  <a href="#">T-Shirts</a>
                </div>
              </li>

              <li><a href="#about">About</a></li>
              <li><a href="#contact">Contact</a></li>
              
              {/* Login/Signup buttons for desktop */}
              <li className="auth-buttons hidden md:block">
                <button onClick={() => setShowLoginModal(true)} className="btn-login">Login</button>
                <button onClick={() => setShowSignupModal(true)} className="btn-signup">Sign Up</button>
              </li>
            </ul>
            
            {/* Login/Signup buttons for mobile */}
            {mobileMenuOpen && (
              <div className="mobile-auth-buttons">
                <button onClick={() => setShowLoginModal(true)} className="btn-login-mobile">Login</button>
                <button onClick={() => setShowSignupModal(true)} className="btn-signup-mobile">Sign Up</button>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero" id="home">
        <div className="container">
          <div className="hero-content">
            <h1>
              <span className="gold">Printing Quality</span>
              <span className="red">at Affordable Rates</span>
            </h1>
            <p>
              High-quality printing that puts your brand front and center.
              From custom gifts to corporate giveaways—crafted just for you.
            </p>

            <div className="btn-container">
              <a href="#products" className="btn">Shop Now</a>
              <a href="#services" className="btn btn-outline">Learn More</a>
            </div>

            <div className="contact-info">
              <div className="contact-item">
                <span>Email:</span>
                <a href="mailto:info@personalizeme.ph">info@personalizeme.ph</a>
              </div>
              <div className="contact-item">
                <span>Text:</span>
                <a href="tel:+639459726272">+63 945972 6272</a>
              </div>
              <div className="contact-item">
                <span>Text:</span>
                <a href="tel:+639624362161">+63 962436 2161</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="services" id="services">
        <div className="container">
          <h2 className="section-title">Our Services</h2>

          <div className="services-grid">
            {services.map(service => (
              <div className="service-card" key={service.id}>
                <div className="service-icon">{service.icon}</div>
                <h3 className="service-title">{service.title}</h3>
                <p className="service-description">{service.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products Section */}
      <section className="products" id="products">
        <div className="container">
          <h2 className="section-title">Top Print Products</h2>

          <div className="products-grid">
            {products.map(product => (
              <div className="product-card" key={product.id}>
                <div className="product-image">
                  {product.image ? (
                    <img src={product.image} alt={product.title} />
                  ) : (
                    <span>Product Image</span>
                  )}
                </div>
                <div className="product-info">
                  <h3 className="product-title">{product.title}</h3>
                  <p className="product-price">{product.price}</p>
                  <button className="btn">Add to Cart</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <span className="follow-us">Follow Us On</span>

            <div className="social-links">
              <a href="https://www.facebook.com/personalizemeprints" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Facebook"></a>
              <a href="https://www.instagram.com/personalizemeprints" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Instagram"></a>
              <a href="https://www.tiktok.com/@personalizemeprints" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="TikTok"></a>
              <a href="https://shopee.ph/personalizemeprints" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Shopee"></a>
            </div>

            <p className="copyright">
              © {new Date().getFullYear()} Personalize Me. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <LoginModal />
      <SignupModal />
    </div>
  );
};

export default LandingPage;
