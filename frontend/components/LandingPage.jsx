"use client";

/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { getStorefrontBanners } from '@/lib/bannerUtils';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useCart } from '@/context/CartContext';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/notificationApi';
import CustomerChatModal from '@/components/chat/CustomerChatModal';
import '@/components/custom-styles.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const HERO_SLIDER_IMAGES = [
  { src: '/products/Tshit_printing.jpg', label: 'T-Shirt Printing',    pos: 'center center' },
  { src: '/products/DTF.jpg',            label: 'DTF Printing',         pos: 'center center' },
  { src: '/products/mugs.jpg',           label: 'Custom Mugs',          pos: 'center center' },
  { src: '/products/ButtonPins.jpg',     label: 'Button Pins & Badges', pos: 'center center' },
  { src: '/products/ecobags.jpg',        label: 'Canvas Totebag',       pos: 'center 70%'    },
  { src: '/products/MousePad.jpg',       label: 'Mousepad',             pos: 'center center' },
  { src: '/products/RefMagnet.jpg',      label: 'Ref Magnet',           pos: 'center center' },
  { src: '/products/Souvenirs.jpg',      label: 'Souvenirs & Gift Items', pos: 'center 65%'  },
  { src: '/products/Stickers.jpg',       label: 'Stickers & Labels',    pos: 'center center' },
  { src: '/products/Bookmarks.jpg',      label: 'Magnetic Bookmark',    pos: 'center center' },
  { src: '/products/Ballpens.jpg',       label: 'Ballpens',             pos: 'center 30%'    },
  { src: '/products/Caps.jpg',           label: 'Caps',                 pos: 'center 60%'    },
];

const PasswordStrength = ({password}) => {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
    /[!@#$%^&*(),.?":{}|<>]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const levels = [
    {label: 'Too Weak',    color: 'var(--red)', width: '20%'},
    {label: 'Weak',        color: 'var(--red)', width: '40%'},
    {label: 'Fair',        color: 'var(--gold)', width: '60%'},
    {label: 'Strong',      color: 'var(--green)', width: '80%'},
    {label: 'Very Strong', color: 'var(--green)', width: '100%'},
  ];
  const isTooShort = password.length > 0 && password.length < 8;
  const isTooLong  = password.length > 32;
  const current    = levels[score - 1] || {label: 'Too Weak', color: 'var(--red)', width: '20%'};
  return (
    <div style={{marginTop: '0.4rem'}}>
      {(isTooShort || isTooLong) && (
        <div style={{ fontSize: '0.7rem', marginBottom: '0.4rem', padding: '0.25rem 0.6rem', borderRadius: '6px',
          background: isTooLong ? 'rgba(196,30,58,0.12)' : 'rgba(212,168,67,0.12)',
          border: `1px solid ${isTooLong ? 'var(--red)' : 'var(--gold)'}`,
          color: isTooLong ? 'var(--red)' : 'var(--gold)' }}>
          {isTooLong ? '⚠ Too long' : '⚠ Too short'}
        </div>
      )}
      <div style={{ height: '4px', borderRadius: '999px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: '999px',
          width: isTooLong ? '100%' : current.width,
          background: isTooLong ? 'var(--red)' : current.color,
          transition: 'width 0.3s ease, background 0.3s ease' }}/>
      </div>
      <div style={{ fontSize: '0.72rem', marginTop: '0.25rem', color: isTooLong ? 'var(--red)' : current.color, transition: 'color 0.3s' }}>
        {isTooLong ? 'Too Long — recommended max 32 characters' : current.label}
      </div>
    </div>
  );
};

const LandingPage = ({onEnterShop}) => {
  const router = useRouter();
  const { currentUser: user, token, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Allow everyone to browse products (no login required)
  const handleEnterShop = () => {
    router.push('/shop');
  };

  const { cartItems, cartCount, removeFromCart } = useCart();
  const [mounted, setMounted] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [lpCartOpen, setLpCartOpen] = useState(false);
  const [lpNotifOpen, setLpNotifOpen] = useState(false);
  const [lpNotifications, setLpNotifications] = useState([]);
  const [lpNotifLoading, setLpNotifLoading] = useState(false);
  const [lpUnreadCount, setLpUnreadCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen]   = useState(false);
  const [scrolled, setScrolled]               = useState(false);
  const [modal, setModal]                     = useState(null);
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [tAndCModalOpen, setTAndCModalOpen]   = useState(false);
  const [hasReadTerms, setHasReadTerms]       = useState(false);
  const [pricelistModalOpen, setPricelistModalOpen] = useState(false);
  const [loginFromPricing, setLoginFromPricing]     = useState(false);
  const [contactForm, setContactForm]   = useState({name: '', email: '', subject: '', message: ''});
  const [contactErrors, setContactErrors] = useState({});
  const [contactSent, setContactSent]   = useState(false);
  const [loginErrors, setLoginErrors]   = useState({});
  const [sessionMessage, setSessionMessage] = useState('');
  const [errors, setErrors]             = useState({});
  const [verificationModal, setVerificationModal] = useState(false);
  const [registeredEmail, setRegisteredEmail]     = useState('');
  const [verificationCode, setVerificationCode]   = useState('');
  const [verifyError, setVerifyError]             = useState('');
  const [resendSuccess, setResendSuccess]         = useState(false);
  const [resendCooldown, setResendCooldown]       = useState(0);
  const [isResending, setIsResending]             = useState(false);
  const [isRegistering, setIsRegistering]         = useState(false);
  const [isLoggingIn, setIsLoggingIn]             = useState(false);
  const [isVerifying, setIsVerifying]             = useState(false);
  const [rememberMe, setRememberMe]               = useState(false);
  const [pendingAuth, setPendingAuth]             = useState(null);
  const [hoveredService, setHoveredService]       = useState(null);
  const [tooltipX, setTooltipX] = useState(0);
  const [tooltipY, setTooltipY] = useState(0);

  const [hoveredNav, setHoveredNav]               = useState(null);
  const [navProducts, setNavProducts]             = useState([]);
  const [navProductsLoading, setNavProductsLoading] = useState(false);
  const [hoveredCollection, setHoveredCollection] = useState(null);
  const [collectionProducts, setCollectionProducts] = useState([]);

  // Hero carousel
  const [heroSlide, setHeroSlide] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [heroBanners, setHeroBanners] = useState([]);

  // Hero right-side image slider
  const [heroImgIdx, setHeroImgIdx] = useState(0);

  // Collections
  const [landingCollections, setLandingCollections] = useState([]);

  // Customer reviews
  const [landingReviews, setLandingReviews] = useState([]);
  const [reviewsIdx, setReviewsIdx] = useState(0);

  // Forgot password
  const [forgotModal, setForgotModal]     = useState(false);
  const [forgotEmail, setForgotEmail]     = useState('');
  const [forgotLinkToken, setForgotLinkToken] = useState('');
  const [forgotError, setForgotError]     = useState('');
  const [forgotSent, setForgotSent]       = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [forgotStep, setForgotStep]                   = useState(1);
  const [forgotCode, setForgotCode]                   = useState('');
  const [forgotNewPassword, setForgotNewPassword]     = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [showForgotPassword, setShowForgotPassword]   = useState(false);
  const [showForgotConfirm, setShowForgotConfirm]     = useState(false);
  const [forgotResendSuccess, setForgotResendSuccess] = useState(false);
  const [forgotResendCooldown, setForgotResendCooldown] = useState(0);
  const [isForgotResending, setIsForgotResending]     = useState(false);
  const [registerPasswordTouched, setRegisterPasswordTouched] = useState(false);
  const [registerConfirmTouched, setRegisterConfirmTouched] = useState(false);
  const [forgotPasswordTouched, setForgotPasswordTouched] = useState(false);
  const [forgotConfirmTouched, setForgotConfirmTouched] = useState(false);

  const [registerForm, setRegisterForm] = useState({
    firstName: '', middleInitial: '', lastName: '',
    address: '', phoneNumber: '', email: '',
    password: '', confirmPassword: '', agreeToTerms: false
  });
  const [loginForm, setLoginForm] = useState({email: '', password: ''});

  // Refs for T&C scroll detection
  const termsScrollRef = useRef(null);
  const navLeaveTimer  = useRef(null);

  // ─── useEffects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setMounted(true);
    // Check if user was logged out (redirected from dashboard)
    const loggedOut = sessionStorage.getItem('justLoggedOut');
    if (loggedOut === 'true') {
      sessionStorage.removeItem('justLoggedOut');
      setSessionMessage('You have been successfully logged out.');
      setTimeout(() => openModal('login'), 300);
    }
    // Check if session expired (token invalid)
    const sessionExpired = sessionStorage.getItem('sessionExpired');
    if (sessionExpired === 'true') {
      sessionStorage.removeItem('sessionExpired');
      setSessionMessage('Your session has expired. Please log in again.');
      setTimeout(() => openModal('login'), 300);
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, {passive: true});
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!token) { setLpNotifications([]); setLpUnreadCount(0); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchNotifications(token);
        if (!cancelled) {
          setLpNotifications(data.notifications ?? []);
          setLpUnreadCount(data.unread_count ?? 0);
        }
      } catch { /* silent */ }
    };
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')),
      {threshold: 0.12}
    );
    document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = document.getElementById('particles');
    if (!container) return;
    const colors = ['var(--gold)', 'var(--gold-light)', 'var(--red)', 'var(--gray-light)'];
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const s = Math.random() * 5 + 2;
      const c = colors[Math.floor(Math.random() * colors.length)];
      p.style.cssText = `width:${s}px;height:${s}px;left:${Math.random()*90+5}%;bottom:${Math.random()*30+10}%;background:${c};box-shadow:0 0 ${s*2}px ${c};animation-duration:${Math.random()*4+3}s;animation-delay:${Math.random()*6}s;`;
      container.appendChild(p);
    }
  }, []);

  useEffect(() => {
    document.body.style.overflow = modal ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [modal]);

  // Resend cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect (() => {
    if (forgotResendCooldown <= 0) return;
    const t = setTimeout(() => setForgotResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [forgotResendCooldown]);

  // Handle reset link from email (check URL parameters)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset_token');
    const email = params.get('email');

    if (resetToken && email) {
      // Verify the token automatically
      handleResetLinkClick(resetToken, email).then(result => {
        if (result.valid) {
          setForgotEmail(email);
          setForgotLinkToken(resetToken);
          setForgotModal(true);
          // Auto-send the 6-digit verification code after link verification
          setForgotStep(3);
          fetch(`${API_URL}/api/send-reset-code`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, token: resetToken }),
          }).catch(() => {});
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          // Invalid/expired link - open forgot modal to Step 1 and show error
          setForgotEmail(email);
          setForgotModal(true);
          setForgotStep(1);
          setForgotError(result.error);
        }
      });
    }
  }, []);

  // Fetch customer reviews for landing page
  useEffect(() => {
    fetch(`${API_URL}/api/storefront/reviews?limit=12`)
      .then(r => r.json())
      .then(d => {
        if (d?.data?.reviews?.length) setLandingReviews(d.data.reviews);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchWithTimeout(`${API_URL}/api/storefront/collections`, {}, 15000)
      .then(r => r.json())
      .then(d => setLandingCollections(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
  }, []);


  // Fetch live banners for hero carousel
  useEffect(() => {
    getStorefrontBanners('landing')
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setHeroBanners(data);
          setHeroSlide(0);
        }
      })
      .catch(() => {});
  }, []);

  // Hero carousel auto-advance
  useEffect(() => {
    if (heroPaused) return;
    const count = heroBanners.length > 0 ? heroBanners.length : 3;
    const t = setInterval(() => {
      setHeroSlide(s => (s + 1) % count);
    }, 4000);
    return () => clearInterval(t);
  }, [heroPaused, heroBanners.length]);

  // Hero right-side image slider
  useEffect(() => {
    const t = setInterval(() => {
      setHeroImgIdx(i => (i + 1) % HERO_SLIDER_IMAGES.length);
    }, 6000);
    return () => clearInterval(t);
  }, []);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const openModal = (type) => { setModal(type); setMobileMenuOpen(false); };

  useEffect(() => {
    if (!modal) {
      setRegisterPasswordTouched(false);
      setRegisterConfirmTouched(false);
      return;
    }
    if (modal === 'register') {
      setRegisterPasswordTouched(false);
      setRegisterConfirmTouched(false);
    }
  }, [modal]);

  useEffect(() => {
    if (!forgotModal) {
      setForgotPasswordTouched(false);
      setForgotConfirmTouched(false);
    }
  }, [forgotModal]);

  const closeModal = () => {
    setModal(null);
    setErrors({});
    setLoginErrors({});
    setSessionMessage('');
    setLoginForm({email: '', password: ''});
    setShowPassword(false);
    setShowConfirm(false);
    setRegisterPasswordTouched(false);
    setRegisterConfirmTouched(false);
    setIsVerifying(false);
    setVerifyError('');
    setPendingAuth(null);
    setHasReadTerms(false);
    setRegisterForm({
      firstName: '', middleInitial: '', lastName: '',
      address: '', phoneNumber: '', email: '',
      password: '', confirmPassword: '', agreeToTerms: false
    });
  };

  const closeMobile = () => { setMobileMenuOpen(false); document.body.style.overflow = ''; };
  const toggleMobile = () => {
    const next = !mobileMenuOpen;
    setMobileMenuOpen(next);
    document.body.style.overflow = next ? 'hidden' : '';
  };

  const handleTermsScroll = () => {
    const el = termsScrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 10;
    if (atBottom) setHasReadTerms(true);
  };

  const handleContactChange = (field, value) => {
    setContactForm(f => ({...f, [field]: value}));
    if (contactErrors[field]) setContactErrors(e => ({...e, [field]: ''}));
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!contactForm.name.trim()) newErrors.name = 'Name is required';
    else if (contactForm.name.trim().length > 120) newErrors.name = 'Name must be 120 characters or fewer';
    if (!contactForm.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactForm.email)) newErrors.email = 'Please enter a valid email address';
    if (!contactForm.subject.trim()) newErrors.subject = 'Subject is required';
    else if (contactForm.subject.trim().length > 200) newErrors.subject = 'Subject must be 200 characters or fewer';
    if (!contactForm.message.trim()) newErrors.message = 'Message is required';
    else if (contactForm.message.trim().length > 5000) newErrors.message = 'Message must be 5000 characters or fewer';
    setContactErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/contact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contactForm),
        }, 15000);
        const data = await res.json();
        if (res.ok && data.message) {
          setContactSent(true);
          setContactForm({name: '', email: '', subject: '', message: ''});
        } else {
          setContactErrors({ submit: data.error || data.message || 'Failed to send message. Please try again.' });
        }
      } catch {
        setContactErrors({ submit: 'Network error. Please try again later.' });
      }
    }
  };

  const handleRegisterChange = (field, value) => {
    if (['firstName', 'lastName'].includes(field)) value = value.replace(/[^a-zA-Z\s]/g, '');
    if (field === 'middleInitial') value = value.replace(/[^a-zA-Z]/g, '').toUpperCase();
    setRegisterForm(f => ({...f, [field]: value}));
    if (errors[field]) setErrors(e => ({...e, [field]: ''}));
  };

  const validateField = (field, value) => {
    switch (field) {
      case 'firstName':
        if (!value.trim()) return 'First name is required';
        if (value.trim().length < 2) return 'First name must be at least 2 characters';
        return '';
      case 'middleInitial':
        if (value && !/^[A-Z]{1,2}$/.test(value)) return 'Middle initial must be 1-2 uppercase letters';
        return '';
      case 'lastName':
        if (!value.trim()) return 'Last name is required';
        if (value.trim().length < 2) return 'Last name must be at least 2 characters';
        return '';
      case 'address':
        if (!value.trim()) return 'Address is required';
        if (value.trim().length < 10) return 'Address must be at least 10 characters';
        return '';
      case 'phoneNumber':
        if (!value.trim()) return 'Phone number is required';
        if (!/^(\+63|0)\d{10}$/.test(value.replace(/\s/g, ''))) return 'Please enter a valid Philippine phone number';
        return '';
      case 'email':
        if (!value.trim()) return 'Email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address';
        return '';
      case 'password':
        if (!value) return 'Password is required';
        if (value.length < 8) return 'Password must be at least 8 characters';
        if (value.length > 64) return 'Password must not exceed 64 characters';
        if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter';
        if (!/[a-z]/.test(value)) return 'Password must contain at least one lowercase letter';
        if (!/\d/.test(value)) return 'Password must contain at least one number';
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) return 'Password must contain at least one special character';
        return '';
      case 'confirmPassword':
        if (!value) return 'Please confirm your password';
        if (value !== registerForm.password) return 'Passwords do not match';
        return '';
      case 'agreeToTerms':
        if (!value) return 'You must agree to the Terms and Conditions';
        return '';
      default: return '';
    }
  };

  // Scroll to first error — runs after DOM paint using name attributes
  const scrollToFirstError = (errorObj) => {
    const fieldOrder = ['firstName', 'lastName', 'address', 'phoneNumber', 'email', 'password', 'confirmPassword'];
    for (const field of fieldOrder) {
      if (errorObj[field]) {
        // Find input by placeholder or just the first .error input in the modal
        const errorInput = document.querySelector('.auth-modal-body input.error, .auth-modal-body textarea.error');
        if (errorInput) {
          errorInput.scrollIntoView({behavior: 'smooth', block: 'center'});
          errorInput.focus();
        }
        break;
      }
    }
  };

  const validateForm = () => {
    const newErrors = {};
    ['firstName','middleInitial','lastName','address','phoneNumber','email','password','confirmPassword']
      .forEach(field => {
        const err = validateField(field, registerForm[field]);
        if (err) newErrors[field] = err;
      });
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      setTimeout(() => scrollToFirstError(newErrors), 50);
      return false;
    }
    return true;
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsRegistering(true);
    try {
      const response = await fetchWithTimeout(`${API_URL}/api/register`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          firstName:    registerForm.firstName.trim(),
          middleInitial: registerForm.middleInitial.trim(),
          lastName:     registerForm.lastName.trim(),
          address:      registerForm.address.trim(),
          phoneNumber:  registerForm.phoneNumber.trim(),
          email:        registerForm.email.trim(),
          password:     registerForm.password,
          password_confirmation: registerForm.confirmPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.errors) {
          const serverErrors = {};
          Object.keys(data.errors).forEach(k => { serverErrors[k] = data.errors[k][0]; });
          setErrors(serverErrors);
        } else {
          setErrors({email: data.error || data.message || 'Registration failed. Please try again.'});
        }
        return;
      }
      setPendingAuth({ token: data.data.token, user: data.data.user, rememberMe });
      setRegisteredEmail(registerForm.email);
      setModal(null);
      setRegisterForm({firstName:'',middleInitial:'',lastName:'',address:'',phoneNumber:'',email:'',password:'',confirmPassword:'',agreeToTerms:false});
      setErrors({});
      setVerifyError('');
      setVerificationModal(true);
    } catch (err) {
      setErrors({email: 'Network error. Make sure the backend server is running.'});
    } finally {
      setIsRegistering(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!loginForm.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginForm.email)) newErrors.email = 'Please enter a valid email';
    if (!loginForm.password) newErrors.password = 'Password is required';
    setLoginErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    setIsLoggingIn(true);
    try {
      const response = await fetchWithTimeout(`${API_URL}/api/login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          email: loginForm.email,
          password: loginForm.password,
          device_token: localStorage.getItem('device_token') || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLoginErrors({password: data.message || 'Invalid email or password.'});
        return;
      }
      // Check 2FA requirement BEFORE writing to storage
      if (data.data.requires_2fa) {
        // Store pending credentials under temporary keys — NOT auth_token/auth_user
        // Final storage write happens in 2fa-challenge onSuccess after OTP verified
        sessionStorage.setItem('pmp_pending_token', data.data.token);
        sessionStorage.setItem('pmp_pending_user', JSON.stringify(data.data.user));
        sessionStorage.setItem('pmp_pending_remember', rememberMe ? '1' : '0');
        sessionStorage.setItem('pending_2fa', 'true');
        const dashboardRoles2fa = ['admin', 'owner', 'salesRep', 'productionOperator', 'qualityControl', 'cashier', 'inventoryManager'];
        const isAdminUser = dashboardRoles2fa.includes(data.data.user.role);
        sessionStorage.setItem('post_2fa_redirect', isAdminUser
          ? '/dashboard/business/dashboardoverview'
          : '/shop');
        closeModal();
        router.push('/dashboard/2fa-challenge');
        return;
      }

      // No 2FA required — write to storage now
      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem('auth_token', data.data.token);
      storage.setItem('auth_user', JSON.stringify(data.data.user));
      try {
        const bc = new BroadcastChannel('pmp_auth');
        bc.postMessage({ type: 'AUTH_UPDATE', token: data.data.token, user: data.data.user });
        bc.close();
      } catch {}

      // Check for redirect destination
      const redirectPath = sessionStorage.getItem('redirectAfterLogin');
      sessionStorage.removeItem('redirectAfterLogin');

      const dashboardRoles = ['admin', 'owner', 'salesRep', 'productionOperator', 'qualityControl', 'cashier', 'inventoryManager'];
      if (dashboardRoles.includes(data.data.user.role)) {
        window.location.href = '/dashboard/business/dashboardoverview';
        return;
      }
      if (loginFromPricing) { setPricelistModalOpen(true); setLoginFromPricing(false); closeModal(); return; }
      closeModal();
      router.push(redirectPath || '/shop');
    } catch (err) {
      setLoginErrors({password: 'Network error. Make sure the backend server is running.'});
    } finally {
      setIsLoggingIn(false);
    }
  };

  // useCallback so the auto-submit useEffect always has a stable, up-to-date reference
  const handleVerify = useCallback(async () => {
    if (verificationCode.length !== 6) { setVerifyError('Please enter the 6-digit code'); return; }
    setVerifyError('');
    setIsVerifying(true);
    try {
      const response = await fetchWithTimeout(`${API_URL}/api/verify-email`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email: registeredEmail, code: verificationCode}),
      });
      const data = await response.json();
      if (!response.ok) { setVerifyError(data.message || 'Verification failed.'); return; }
      if (pendingAuth) {
        const storage = pendingAuth.rememberMe ? localStorage : sessionStorage;
        storage.setItem('auth_token', pendingAuth.token);
        storage.setItem('auth_user', JSON.stringify(pendingAuth.user));
        try {
          const bc = new BroadcastChannel('pmp_auth');
          bc.postMessage({ type: 'AUTH_UPDATE', token: pendingAuth.token, user: pendingAuth.user });
          bc.close();
        } catch {}
        setPendingAuth(null);
      }
      setVerificationModal(false);
      setVerificationCode('');
      openModal('login');
    } catch (err) {
      setVerifyError('Network error. Make sure backend is running.');
    } finally {
      setIsVerifying(false);
    }
  }, [verificationCode, registeredEmail, pendingAuth]);

// STEP 1 — Send reset link to email
const handleForgotSubmit = async () => {
  if (!forgotEmail.trim()) { setForgotError('Email is required'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) {
    setForgotError('Please enter a valid email address');
    return;
  }
  setForgotError('');
  setIsSendingReset(true);
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/forgot-password`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: forgotEmail}),
    });
    const data = await response.json();
    if (!response.ok) {
      setForgotError(data.message || 'Failed to send reset link.');
      return;
    }
    setForgotSent(true);
    setForgotStep(1); // Stay on step 1, just show success message
  } catch (err) {
    setForgotError('Network error. Make sure the backend server is running.');
  } finally {
    setIsSendingReset(false);
  }
};

// Handle reset link from email (when user clicks link in email)
const handleResetLinkClick = async (token, email) => {
  if (!token || !email) return { valid: false, error: 'Invalid link' };
  setIsSendingReset(true);
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/verify-reset-token`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token, email}),
    });
    const data = await response.json();
    if (!response.ok) {
      return { valid: false, error: data.message || 'Invalid or expired link' };
    }
    return { valid: true, user: data.user };
  } catch (err) {
    return { valid: false, error: 'Network error' };
  } finally {
    setIsSendingReset(false);
  }
};

// STEP 2 — User confirmed, now send verification code
const handleSendResetCode = async () => {
  setForgotError('');
  setIsSendingReset(true);
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/send-reset-code`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: forgotEmail, token: forgotLinkToken}),
    });
    const data = await response.json();
    if (!response.ok) {
      setForgotError(data.message || 'Failed to send code.');
      return;
    }
    setForgotStep(3); // Move to code verification step
  } catch (err) {
    setForgotError('Network error. Make sure the backend server is running.');
  } finally {
    setIsSendingReset(false);
  }
};

// STEP 3 — Verify the 6-digit code
const handleForgotVerifyCode = async () => {
  if (forgotCode.length !== 6) { setForgotError('Please enter the 6-digit code'); return; }
  setForgotError('');
  setIsSendingReset(true);
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/verify-reset-code`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: forgotEmail, code: forgotCode}),
    });
    const data = await response.json();
    if (!response.ok) { setForgotError(data.message || 'Invalid or expired code.'); return; }
    setForgotStep(4); // Move to password reset step
  } catch (err) {
    setForgotError('Network error. Make sure the backend server is running.');
  } finally {
    setIsSendingReset(false);
  }
};

// Resend verification code
const handleForgotResend = async () => {
  if (forgotResendCooldown > 0 || isForgotResending) return;
  setIsForgotResending(true);
  setForgotResendSuccess(false);
  setForgotError('');
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/send-reset-code`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: forgotEmail}),
    });
    const data = await response.json();
    if (!response.ok) {
      setForgotError(data.message || 'Failed to resend code.');
      return;
    }
    setForgotCode('');
    setForgotResendSuccess(true);
    setForgotResendCooldown(60);
    setTimeout(() => setForgotResendSuccess(false), 5000);
  } catch (err) {
    setForgotError('Network error.');
  } finally {
    setIsForgotResending(false);
  }
};

// STEP 4 — Submit new password
const handleForgotResetPassword = async () => {
  if (!forgotNewPassword) { setForgotError('Password is required'); return; }
  if (forgotNewPassword.length < 8) { setForgotError('Password must be at least 8 characters'); return; }
  if (!/[A-Z]/.test(forgotNewPassword)) { setForgotError('Password must contain at least one uppercase letter'); return; }
  if (!/[a-z]/.test(forgotNewPassword)) { setForgotError('Password must contain at least one lowercase letter'); return; }
  if (!/\d/.test(forgotNewPassword)) { setForgotError('Password must contain at least one number'); return; }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(forgotNewPassword)) { setForgotError('Password must contain at least one special character'); return; }
  if (forgotNewPassword !== forgotConfirmPassword) { setForgotError('Passwords do not match'); return; }
  setForgotError('');
  setIsSendingReset(true);
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/reset-password`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: forgotEmail, code: forgotCode, password: forgotNewPassword, password_confirmation: forgotConfirmPassword}),
    });
    const data = await response.json();
    if (!response.ok) { setForgotError(data.message || 'Failed to reset password.'); return; }
    // Success — close and go to login
    setForgotModal(false);
    setForgotStep(1);
    setForgotCode('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    openModal('login');
  } catch (err) {
    setForgotError('Network error. Make sure the backend server is running.');
  } finally {
    setIsSendingReset(false);
  }
};

  const handleResendCode = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setResendSuccess(false);
    setVerifyError('');
    try {
      const response = await fetchWithTimeout(`${API_URL}/api/resend-code`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email: registeredEmail}),
      });
      const data = await response.json();
      if (!response.ok) {
        setVerifyError(data.message || 'Failed to resend code.');
        return;
      }
      setVerificationCode('');
      setResendSuccess(true);
      setResendCooldown(60);
      setTimeout(() => setResendSuccess(false), 5000);
    } catch (err) {
      setVerifyError('Network error. Make sure backend is running.');
    } finally {
      setIsResending(false);
    }
  };

  // ─── Mega nav handlers ───────────────────────────────────────────────────────

  const fetchNavProducts = async () => {
    if (navProducts.length > 0 || navProductsLoading) return;
    setNavProductsLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/products`, {}, 15000);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      setNavProducts(list.filter(p => p.isPublished !== false));
    } catch {}
    setNavProductsLoading(false);
  };

  const handleNavEnter = (which) => {
    clearTimeout(navLeaveTimer.current);
    setHoveredNav(which);
    if (which === 'products') fetchNavProducts();
  };

  const handleNavLeave = () => {
    navLeaveTimer.current = setTimeout(() => {
      setHoveredNav(null);
      setHoveredCollection(null);
      setCollectionProducts([]);
    }, 150);
  };

  const handlePanelEnter = () => clearTimeout(navLeaveTimer.current);

  const handleHoverCollection = async (col) => {
    const colId = col.id ?? col._id;
    setHoveredCollection(colId);
    setCollectionProducts([]);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/storefront/collections/${col.slug}`, {}, 10000);
      const data = await res.json();
      setCollectionProducts(Array.isArray(data?.data?.products) ? data.data.products : []);
    } catch {}
  };

  // ─── Data ─────────────────────────────────────────────────────────────────────

  const services = [
    { img: '/products/Tshit_printing.jpg', title: 'T-Shirt Printing',     category: 'tshirts', desc: 'Silkscreen & DTF printing available. Starts at ₱300. Final cost depends on quantity, design complexity, material type, and panel print. Perfect for teams, events, and merchandise.' },
    { img: '/products/DTF.jpg',            title: 'DTF Printing',          category: 'tshirts', desc: 'Direct-to-Film printing. Starts at ₱250 per meter. Vivid, full-color prints on fabric. Final cost depends on quantity. Great for custom apparel and fabric items.' },
    { img: '/products/mugs.jpg',           title: 'Mugs (11oz)',           category: 'mugs', desc: 'Three variants: Ceramic White, Inner Color Mug, and Magic Mug. Starting at ₱50/pc for 501–1000 pcs. Sublimation-printed for lasting, vibrant color.' },
    { img: '/products/ButtonPins.jpg',     title: 'Button Pins & Badges',  category: 'bags', desc: 'Available as Badge/Button Pin, Magnet Badge, and Keychain Badge (2.25"). Starting at ₱10/pc for 501–1000 pcs. Ideal for promotions, events, and giveaways.' },
    { img: '/products/ecobags.jpg',        title: 'Canvas Totebag',        category: 'bags', desc: 'Plain and w/ Zipper & Pocket variants. Sizes: Small (10x12"), Medium (12x14"), Large (14x16"). Starting at ₱70/pc for bulk orders. Eco-friendly and customizable.' },
    { img: '/products/MousePad.jpg',       title: 'Mousepad',              category: 'stickers', desc: 'Rectangle 22x18cm sublimation-printed mousepad. Starting at ₱70/pc for 501–1000 pcs. Full-color custom design on a smooth, non-slip surface.' },
    { img: '/products/RefMagnet.jpg',      title: 'Ref Magnet',            category: 'stickers', desc: 'Custom refrigerator magnets up to 3" max size. Starting at ₱15/pc for 501–1000 pcs. Popular souvenir and giveaway item for events and occasions.' },
    { img: '/products/Souvenirs.jpg',      title: 'Souvenirs & Gift Items', category: 'books', desc: 'Custom souvenir items for weddings, birthdays, debuts, and corporate events. Wide variety of personalized items available.' },
    { img: '/products/Stickers.jpg',       title: 'Stickers & Labels',     category: 'stickers', desc: 'Kisscut & Diecut. Variants: Vinyl Waterproof, Laminated, Specialty Label, Photopaper, Regular, and Kraft. Priced per A4 sheet. Starting at ₱25.' },
    { img: '/products/Bookmarks.jpg',      title: 'Magnetic Bookmark',     category: 'books', desc: 'Maximum size 2.5". Starting at ₱15/pc for 501–1000 pcs. Custom-printed magnetic bookmarks — perfect gifts and giveaways for readers and events.' },
    { img: '/products/Ballpens.jpg',       title: 'Ballpens',              category: 'books', desc: 'Custom printed ballpens — affordable and practical promotional item. Ideal for corporate giveaways, school events, and bulk orders.' },
    { img: '/products/Caps.jpg',           title: 'Caps',                  category: 'tshirts', desc: 'Custom printed or embroidered caps. Perfect for teams, sports events, corporate uniforms, and merchandise. Contact us for bulk pricing.' },
  ];


  const publicPricing = [
    { category: 'T-Shirt Printing',      startingAt: '₱300', note: 'Final cost depends on quantity, design, material & panel print.' },
    { category: 'DTF Printing',          startingAt: '₱250', note: 'Per meter. Final cost depends on quantity.' },
    { category: 'Mugs (11oz)',           startingAt: '₱50',  note: 'Ceramic White, Inner Color & Magic Mug variants.' },
    { category: 'Button Badges (2.25")', startingAt: '₱10',  note: 'Badge/Button Pin, Magnet Badge & Keychain Badge.' },
    { category: 'Canvas Totebag',        startingAt: '₱70',  note: 'Plain & w/ Zipper+Pocket. Small, Medium, Large.' },
    { category: 'Ref Magnet',            startingAt: '₱15',  note: 'Maximum size 3".' },
    { category: 'Magnetic Bookmark',     startingAt: '₱15',  note: 'Maximum size 2.5".' },
    { category: 'Stickers & Labels',     startingAt: '₱25',  note: 'Kisscut / Diecut. Vinyl, Specialty, Photopaper, Regular & Kraft.' },
  ];

  const fullPricelist = [
    { category: 'T-Shirt Printing', note: 'Final cost depends on quantity, design, material & panel print.', tiers: null, startingAt: '₱300' },
    { category: 'DTF Printing', note: 'Per meter. Final cost depends on quantity.', tiers: null, startingAt: '₱250/meter' },
    { category: 'Mugs (11oz)', note: null, variants: [
      { name: 'Ceramic White',   tiers: [['1-20 pcs','95'],['21-30 pcs','90'],['31-50 pcs','85'],['51-100 pcs','80'],['101-300 pcs','70'],['301-500 pcs','60'],['501-1000 pcs','50']] },
      { name: 'Inner Color Mug', tiers: [['1-20 pcs','100'],['21-30 pcs','95'],['31-50 pcs','90'],['51-100 pcs','85'],['101-300 pcs','75'],['301-500 pcs','65'],['501-1000 pcs','55']] },
      { name: 'Magic Mug',       tiers: [['1-20 pcs','200'],['21-30 pcs','180'],['31-50 pcs','170'],['51-100 pcs','160'],['101-300 pcs','150'],['301-500 pcs','130'],['501-1000 pcs','100']] },
    ]},
    { category: 'Button Badges (2.25")', note: null, variants: [
      { name: 'Badge/Button Pin', tiers: [['1-20 pcs','30'],['21-30 pcs','28'],['31-50 pcs','25'],['51-100 pcs','20'],['101-300 pcs','18'],['301-500 pcs','15'],['501-1000 pcs','10']] },
      { name: 'Magnet Badge',     tiers: [['1-20 pcs','30'],['21-30 pcs','28'],['31-50 pcs','25'],['51-100 pcs','23'],['101-300 pcs','20'],['301-500 pcs','18'],['501-1000 pcs','15']] },
      { name: 'Keychain Badge',   tiers: [['1-20 pcs','33'],['21-30 pcs','30'],['31-50 pcs','28'],['51-100 pcs','25'],['101-300 pcs','23'],['301-500 pcs','20'],['501-1000 pcs','18']] },
    ]},
    { category: 'Canvas Totebag', note: null, variants: [
      { name: 'Plain Small (10x12")',               tiers: [['1-20 pcs','100'],['21-30 pcs','95'],['31-50 pcs','90'],['51-100 pcs','85'],['101-300 pcs','80'],['301-500 pcs','75'],['501-1000 pcs','70']] },
      { name: 'Plain Medium (12x14")',              tiers: [['1-20 pcs','110'],['21-30 pcs','100'],['31-50 pcs','95'],['51-100 pcs','90'],['101-300 pcs','85'],['301-500 pcs','80'],['501-1000 pcs','75']] },
      { name: 'Plain Large (14x16")',               tiers: [['1-20 pcs','120'],['21-30 pcs','110'],['31-50 pcs','105'],['51-100 pcs','100'],['101-300 pcs','95'],['301-500 pcs','90'],['501-1000 pcs','85']] },
      { name: 'w/ Zipper & Pocket Small (10x12")',  tiers: [['1-20 pcs','130'],['21-30 pcs','120'],['31-50 pcs','115'],['51-100 pcs','110'],['101-300 pcs','105'],['301-500 pcs','95'],['501-1000 pcs','90']] },
      { name: 'w/ Zipper & Pocket Medium (12x14")', tiers: [['1-20 pcs','140'],['21-30 pcs','130'],['31-50 pcs','125'],['51-100 pcs','120'],['101-300 pcs','115'],['301-500 pcs','110'],['501-1000 pcs','105']] },
      { name: 'w/ Zipper & Pocket Large (14x16")',  tiers: [['1-20 pcs','150'],['21-30 pcs','140'],['31-50 pcs','135'],['51-100 pcs','130'],['101-300 pcs','125'],['301-500 pcs','120'],['501-1000 pcs','115']] },
    ]},
    { category: 'Ref Magnet (Max 3")',          note: null, tiers: [['1-20 pcs','30'],['21-30 pcs','28'],['31-50 pcs','25'],['51-100 pcs','23'],['101-300 pcs','20'],['301-500 pcs','18'],['501-1000 pcs','15']] },
    { category: 'Magnetic Bookmark (Max 2.5")', note: null, tiers: [['1-20 pcs','30'],['21-30 pcs','28'],['31-50 pcs','25'],['51-100 pcs','23'],['101-300 pcs','20'],['301-500 pcs','18'],['501-1000 pcs','15']] },
    { category: 'Stickers & Labels (Kisscut / Diecut)', note: 'Price is per A4 size, depending on how many pieces fit on one A4 sheet.', variants: [
      { name: 'Vinyl Waterproof (Glossy/Matte/Transparent)',                         tiers: [['1-30 pcs','50'],['31-50 pcs','45'],['51-100 pcs','43'],['101-300 pcs','40'],['301-500 pcs','38'],['501-1000 pcs','35']] },
      { name: 'Vinyl Waterproof Laminated (Glossy/Matte/Glittered/Holographic)',     tiers: [['1-30 pcs','55'],['31-50 pcs','50'],['51-100 pcs','48'],['101-300 pcs','45'],['301-500 pcs','43'],['501-1000 pcs','40']] },
      { name: 'Specialty Label Waterproof (Pearl Glossy/Aluminum/Gold/Holographic)', tiers: [['1-30 pcs','65'],['31-50 pcs','60'],['51-100 pcs','58'],['101-300 pcs','55'],['301-500 pcs','53'],['501-1000 pcs','50']] },
      { name: 'Photopaper Waterproof (Glossy/Matte)',                                tiers: [['1-30 pcs','45'],['31-50 pcs','40'],['51-100 pcs','38'],['101-300 pcs','35'],['301-500 pcs','33'],['501-1000 pcs','30']] },
      { name: 'Regular Sticker Paper Non-Waterproof (Glossy/Matte)',                 tiers: [['1-30 pcs','40'],['31-50 pcs','38'],['51-100 pcs','35'],['101-300 pcs','33'],['301-500 pcs','30'],['501-1000 pcs','28']] },
      { name: 'Kraft Sticker Paper (Glossy/Matte/Transparent)',                      tiers: [['1-30 pcs','35'],['31-50 pcs','33'],['51-100 pcs','30'],['101-300 pcs','28'],['301-500 pcs','27'],['501-1000 pcs','25']] },
    ]},
  ];

  // ─── SVG helpers ──────────────────────────────────────────────────────────────
  const EyeOpen = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
    </svg>
  );
  const EyeClosed = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75C21.27 7.61 17 4.5 12 4.5c-1.23 0-2.41.2-3.51.57l2.17 2.17C11.13 7.09 11.56 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 0 1-5-5c0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
    </svg>
  );

  // ─── Reusable step indicator ──────────────────────────────────────────────────
  const StepIndicator = ({step}) => (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0.6rem 1.5rem',
      background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem',
        color: step === 1 ? 'var(--gold)' : 'var(--gray)', fontWeight: '600' }}>
        <div style={{ width: '20px', height: '20px', borderRadius: '50%', fontWeight: '700',
          background: step === 1 ? 'var(--gold)' : 'rgba(212,168,67,0.2)',
          color: step === 1 ? 'var(--black)' : 'var(--gold)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
          {step > 1 ? '✓' : '1'}
        </div>
        Fill in Details
      </div>
      <div style={{ flex: 1, height: '2px', borderRadius: '999px', margin: '0 0.25rem',
        background: step > 1 ? 'var(--gold)' : 'var(--border)' }}/>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem',
        color: step === 2 ? 'var(--gold)' : 'var(--gray)', fontWeight: '600' }}>
        <div style={{ width: '20px', height: '20px', borderRadius: '50%', fontWeight: '700',
          background: step === 2 ? 'var(--gold)' : 'var(--border)',
          color: step === 2 ? 'var(--black)' : 'var(--gray)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>2</div>
        Review T&amp;C
      </div>
    </div>
  );

  // Hero carousel slides
  const heroSlides = [
    {
      tag: 'Premium Custom Printing',
      titleParts: [
        {text: 'Print What', plain: true},
        {break: true},
        {text: 'Represents ', className: 'red-text'},
        {text: 'You', className: 'gold-text'},
      ],
      subtitle: 'High-quality personalized printing for t-shirts, mugs, souvenirs, and more. Upload your design and we\'ll make it real.',
      cta: {label: 'Browse Products', action: 'shop'},
      cta2: {label: 'How It Works', href: '#how-it-works'},
    },
    {
      tag: 'Fast Turnaround',
      titleParts: [
        {text: 'Ready in ', plain: true},
        {text: '24 Hours', className: 'gold-text'},
      ],
      subtitle: 'Most orders are printed and ready within a day. Rush orders available for urgent needs.',
      cta: {label: 'View Services', href: '#services'},
      cta2: {label: 'Get a Quote', action: 'login'},
    },
    {
      tag: 'Bulk Orders Welcome',
      titleParts: [
        {text: 'Big Orders, ', plain: true},
        {text: 'Better Prices', className: 'gold-text'},
      ],
      subtitle: 'The more you order, the more you save. Check our full pricelist for bulk pricing breakdowns.',
      cta: {label: 'View Pricing', href: '#pricing'},
      cta2: {label: 'Register Free', action: 'register'},
    },
  ];

  const effectiveSlides = heroBanners.length > 0
    ? heroBanners.map(b => ({
        tag:        null,
        image:      b.image || null,
        titleParts: [{ text: b.headline || '', plain: true }],
        subtitle:   b.subtext || '',
        cta:        b.ctaLabel ? { label: b.ctaLabel, href: b.ctaLink || '#' } : null,
        cta2:       null,
      }))
    : heroSlides;

  const currentBannerImage = effectiveSlides[heroSlide]?.image ?? null;


  // ─── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* NAVBAR */}
      <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="container">
          <div className="nav-inner">
            <a href="#" className="nav-logo" style={{ cursor: 'default' }} onClick={(e) => e.preventDefault()}>
              <img src="/logos/PersonalizeMe logo.png" alt="Personalize Me Prints" className="nav-logo-mark"/>
              <div className="nav-logo-text">PERSONALIZE <span>ME</span><br/>PRINTS</div>
            </a>
            <ul className="nav-links">
              <li className="nav-has-mega"
                  onMouseEnter={() => handleNavEnter('products')}
                  onMouseLeave={handleNavLeave}>
                <a href="#services" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  Products
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </a>
              </li>
              <li className="nav-has-mega"
                  onMouseEnter={() => handleNavEnter('categories')}
                  onMouseLeave={handleNavLeave}>
                <a href="#" style={{ display: 'flex', alignItems: 'center', gap: '3px' }} onClick={(e) => e.preventDefault()}>
                  Categories
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </a>
              </li>
              <li><a href="#how-it-works">How It Works</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="#contact">Contact</a></li>
              <li><a href="/shop" className="nav-go-to-shop">Go to Shop</a></li>
            </ul>
            <div className="nav-auth" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {mounted && (user ? (
                <>
                  {/* Cart popup */}
                  <div style={{position:'relative'}}>
                    <button type="button" className="lp-nav-icon-btn" title="Cart" onClick={() => setLpCartOpen(o => !o)} style={{position:'relative'}}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                      </svg>
                      {cartCount > 0 && <span className="lp-nav-badge">{cartCount > 99 ? '99+' : cartCount}</span>}
                    </button>
                    {lpCartOpen && (
                      <>
                        <div style={{position:'fixed',inset:0,zIndex:98}} onClick={() => setLpCartOpen(false)} />
                        <div className="lp-nav-popup">
                          <div className="lp-nav-popup-header">
                            Cart
                            {cartCount > 0 && <span className="lp-nav-popup-count">{cartCount}</span>}
                            <button className="lp-nav-popup-close" onClick={() => setLpCartOpen(false)}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                          {cartItems.length === 0 ? (
                            <div className="lp-nav-popup-empty">
                              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                              <span className="lp-nav-popup-empty-title">Your cart is empty</span>
                              <button className="lp-nav-popup-cta" onClick={() => { setLpCartOpen(false); handleEnterShop(); }}>Continue shopping</button>
                            </div>
                          ) : (
                            <>
                              <div className="lp-nav-popup-items">
                                {cartItems.map((item, i) => (
                                  <div key={item.lineId || i} className="lp-nav-popup-item">
                                    {item.image ? (
                                      <img src={item.image} alt={item.productName} className="lp-nav-popup-item-img" />
                                    ) : (
                                      <div className="lp-nav-popup-item-img-ph" />
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div className="lp-nav-popup-item-name">{item.productName}</div>
                                      {item.variantName && <div className="lp-nav-popup-item-variant">{item.variantName}</div>}
                                      <div className="lp-nav-popup-item-price">₱{(item.lineTotal||0).toLocaleString()} × {item.qty}</div>
                                    </div>
                                    <button
                                      className="lp-nav-popup-remove"
                                      onClick={() => removeFromCart(item.lineId)}
                                      title="Remove"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <div className="lp-nav-popup-footer">
                                <div className="lp-nav-popup-total"><span>Total</span><span>₱{cartItems.reduce((s,i)=>s+(i.lineTotal||0),0).toLocaleString()}</span></div>
                                <a href="/shop/cart" onClick={() => setLpCartOpen(false)} className="lp-nav-popup-view-btn">View Cart</a>
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Notifications popup */}
                  <div style={{position:'relative'}}>
                    <button type="button" className="lp-nav-icon-btn" title="Notifications" onClick={() => setLpNotifOpen(o => !o)} style={{position:'relative'}}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                      </svg>
                      {lpUnreadCount > 0 && <span className="lp-nav-badge notif">{lpUnreadCount > 99 ? '99+' : lpUnreadCount}</span>}
                    </button>
                    {lpNotifOpen && (
                      <>
                        <div style={{position:'fixed',inset:0,zIndex:98}} onClick={() => setLpNotifOpen(false)} />
                        <div className="lp-nav-popup lp-nav-notif-popup">
                          <div className="lp-nav-popup-header">
                            Notifications
                            {lpUnreadCount > 0 && <span className="lp-nav-popup-count red">{lpUnreadCount}</span>}
                            {lpUnreadCount > 0 && (
                              <button className="lp-nav-popup-mark-all" onClick={async () => { try { await markAllNotificationsRead(token); setLpUnreadCount(0); setLpNotifications(p => p.map(n => ({...n, is_read: true}))); } catch{} }}>Mark all read</button>
                            )}
                            <button className="lp-nav-popup-close" onClick={() => setLpNotifOpen(false)}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                          <div className="lp-nav-notif-body">
                            {lpNotifications.length === 0 ? (
                              <div className="lp-nav-popup-empty">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                                <span className="lp-nav-popup-empty-title">No notifications</span>
                              </div>
                            ) : lpNotifications.map((n, i) => {
                              const id = n._id ?? n.id ?? String(i);
                              return (
                                <div key={id} className={`lp-nav-notif-item${n.is_read ? '' : ' unread'}`} onClick={async () => { if (!n.is_read) { try { await markNotificationRead(token, id); setLpUnreadCount(c => Math.max(0,c-1)); setLpNotifications(p => p.map(x => x._id===id||x.id===id ? {...x,is_read:true} : x)); } catch{} } }}>
                                  <div className={`lp-nav-notif-dot${n.is_read ? ' read' : ''}`} />
                                  <div>
                                    <div className="lp-nav-notif-title" style={{fontWeight: n.is_read ? 400 : 600}}>{n.title}</div>
                                    <div className="lp-nav-notif-msg">{n.message}</div>
                                    <div className="lp-nav-notif-time">{new Date(n.created_at).toLocaleDateString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{position:'relative'}}>
                    <button className={`lp-nav-avatar-btn${user?.avatar ? ' has-avatar' : ''}`} onClick={() => setUserMenuOpen(o => !o)} title="Account">
                      {user?.avatar ? (
                        <img src={user.avatar} alt="avatar" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                      )}
                    </button>
                    {userMenuOpen && (
                      <>
                        <div style={{position:'fixed',inset:0,zIndex:98}} onClick={() => setUserMenuOpen(false)} />
                        <div className="lp-nav-user-menu">
                          <div className="lp-nav-user-info">
                            <div className="lp-nav-user-label">Signed in as</div>
                            <div className="lp-nav-user-name-full">{user?.firstName} {user?.lastName}</div>
                          </div>
                          <a href="/shop/profile" className="lp-nav-menu-item" onClick={() => setUserMenuOpen(false)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            My Profile
                          </a>
                          <a href="/shop/orders-history" className="lp-nav-menu-item" onClick={() => setUserMenuOpen(false)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            My Orders
                          </a>
                          <button onClick={() => { logout(); setUserMenuOpen(false); }} className="lp-nav-menu-item lp-nav-logout">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                            Log Out
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <button className="btn-nav-login" onClick={() => openModal('login')}>Sign In</button>
                  <button className="btn-nav-register" onClick={() => openModal('register')}>Get Started</button>
                </>
              ))}
            </div>
            <button className={`hamburger ${mobileMenuOpen ? 'open' : ''}`} onClick={toggleMobile} aria-label="Menu">
              <span/><span/><span/>
            </button>
          </div>
        </div>

        {/* Mega nav panels */}
        {hoveredNav && (
          <div
            className="mega-nav-panel"
            onMouseEnter={handlePanelEnter}
            onMouseLeave={handleNavLeave}
          >
            <div className="mega-nav-inner">
              {hoveredNav === 'products' ? (
                navProductsLoading ? (
                  <div className="mega-nav-loading">Loading products...</div>
                ) : navProducts.length === 0 ? (
                  <div className="mega-nav-empty">No products yet</div>
                ) : (() => {
                  const grouped = navProducts.reduce((acc, p) => {
                    const cat = p.category || 'Other';
                    if (!acc[cat]) acc[cat] = [];
                    acc[cat].push(p);
                    return acc;
                  }, {});
                  return (
                    <>
                      <div className="mega-products-columns">
                        {Object.entries(grouped).map(([cat, prods]) => (
                          <div key={cat} className="mega-products-col">
                            <div className="mega-col-heading">{cat}</div>
                            {prods.map(p => (
                              <button
                                key={p._id ?? p.id}
                                className="mega-col-item"
                                onClick={() => { setHoveredNav(null); router.push('/shop'); }}
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="mega-nav-footer">
                        <button onClick={() => { setHoveredNav(null); router.push('/shop'); }}>
                          View all products
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '4px', verticalAlign: 'middle' }}>
                            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                          </svg>
                        </button>
                      </div>
                    </>
                  );
                })()
              ) : (
                landingCollections.length === 0 ? (
                  <div className="mega-nav-empty">No categories yet</div>
                ) : (
                  <div className="mega-categories-layout">
                    <div className="mega-cat-list">
                      {landingCollections.map(col => {
                        const colId = col.id ?? col._id;
                        return (
                          <button
                            key={colId}
                            className={`mega-cat-item${hoveredCollection === colId ? ' active' : ''}`}
                            onMouseEnter={() => handleHoverCollection(col)}
                            onClick={() => { setHoveredNav(null); router.push('/shop'); }}
                          >
                            <span>{col.title}</span>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 18 15 12 9 6"/>
                            </svg>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mega-cat-products">
                      {collectionProducts.length === 0 ? (
                        <div className="mega-cat-empty">Hover a category to preview products</div>
                      ) : (
                        <div className="mega-col-products-list">
                          {collectionProducts.map(p => (
                            <button
                              key={p.id ?? p._id}
                              className="mega-col-item"
                              onClick={() => { setHoveredNav(null); router.push('/shop'); }}
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </nav>

      {/* MOBILE MENU */}
      <div className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
        <a href="#services"     onClick={closeMobile}>Products</a>
        <a href="#how-it-works" onClick={closeMobile}>How It Works</a>
        <a href="#pricing"      onClick={closeMobile}>Pricing</a>
        <a href="#contact"      onClick={closeMobile}>Contact</a>
        <a href="/shop"         onClick={closeMobile}>Go to Shop</a>
        <div className="mobile-auth-btns">
          {mounted && !user && (
            <>
              <button className="btn-nav-login" onClick={() => openModal('login')}>Sign In</button>
              <button className="btn-nav-register" onClick={() => openModal('register')}>Get Started</button>
            </>
          )}
        </div>
      </div>

      {/* HERO */}
      <section className="hero" id="home">
        <div
          className="hero-content"
          onMouseEnter={() => setHeroPaused(true)}
          onMouseLeave={() => setHeroPaused(false)}
        >
          <div className="hero-carousel">
            {effectiveSlides.map((slide, i) => (
              <div
                key={i}
                className={`hero-slide${heroSlide === i ? ' active' : ''}`}
              >
                <h1 className="hero-title">
                  {slide.titleParts.map((part, j) =>
                    part.break
                      ? <br key={j}/>
                      : part.plain
                        ? <span key={j}>{part.text}</span>
                        : <span key={j} className={part.className}>{part.text}</span>
                  )}
                </h1>
                {slide.subtitle && <p className="hero-subtitle">{slide.subtitle}</p>}
                {(slide.cta || slide.cta2) && (
                  <div className="hero-actions">
                    {slide.cta && (slide.cta.href ? (
                      <a href={slide.cta.href} className="btn-primary">
                        {slide.cta.label}
                      </a>
                    ) : (
                      <button
                        className="btn-primary"
                        suppressHydrationWarning
                        onClick={() => {
                          if (slide.cta.action === 'shop') handleEnterShop();
                          else openModal(slide.cta.action);
                        }}
                      >
                        {slide.cta.label}
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor"
                            strokeWidth="1.8" strokeLinecap="round"
                            strokeLinejoin="round"/>
                        </svg>
                      </button>
                    ))}
                    {slide.cta2 && (slide.cta2.href ? (
                      <a href={slide.cta2.href} className="btn-secondary">
                        {slide.cta2.label}
                      </a>
                    ) : (
                      <button
                        className="btn-secondary"
                        suppressHydrationWarning
                        onClick={() => openModal(slide.cta2.action)}
                      >
                        {slide.cta2.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
        <div className="hero-visual">
          {currentBannerImage ? (
            <img
              src={currentBannerImage}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }}
            />
          ) : (
            <div className="hero-image-slider">
              {HERO_SLIDER_IMAGES.map((img, i) => (
                <img
                  key={img.src}
                  src={img.src}
                  alt={img.label}
                  className={`hero-slider-img${heroImgIdx === i ? ' active' : ''}`}
                  style={{ objectPosition: img.pos }}
                />
              ))}
              <div className="hero-slider-label">{HERO_SLIDER_IMAGES[heroImgIdx].label}</div>
              <div className="hero-slider-dots">
                {HERO_SLIDER_IMAGES.map((_, i) => (
                  <button
                    key={i}
                    className={`hero-slider-dot${heroImgIdx === i ? ' active' : ''}`}
                    onClick={() => setHeroImgIdx(i)}
                    aria-label={`Product ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Nav centered across full banner */}
        <div className="hero-nav">
          <button
            className="hero-nav-btn"
            aria-label="Previous slide"
            onClick={() => setHeroSlide(i => (i - 1 + effectiveSlides.length) % effectiveSlides.length)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div className="hero-pills">
            {effectiveSlides.map((_, i) => (
              <button
                key={i}
                className={`hero-pill${heroSlide === i ? ' active' : ''}`}
                onClick={() => setHeroSlide(i)}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
          <button
            className="hero-nav-btn"
            aria-label="Next slide"
            onClick={() => setHeroSlide(i => (i + 1) % effectiveSlides.length)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </section>

      {/* COLLECTIONS SHOWCASE */}
      {landingCollections.length > 0 && (
        <section className="lp-collections-section">
          <div className="container">
            <div className="lp-collections-header">
              <div>
                <h2 className="lp-collections-title">Shop by Collection</h2>
                <p className="lp-collections-sub">Handpicked products for every occasion</p>
              </div>
              <button className="lp-collections-viewall" onClick={handleEnterShop}>
                View all
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
            </div>
            <div className="lp-collections-grid">
              {landingCollections.slice(0, 6).map(col => (
                <button
                  key={col.id ?? col._id}
                  className="lp-collection-card"
                  onClick={handleEnterShop}
                >
                  <div className="lp-collection-card-img">
                    {col.image ? (
                      <img src={col.image} alt={col.title} />
                    ) : (
                      <div className="lp-collection-card-placeholder">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                      </div>
                    )}
                    <div className="lp-collection-card-overlay" />
                    <div className="lp-collection-card-info">
                      <span className="lp-collection-card-title">{col.title}</span>
                      {col.productCount > 0 && (
                        <span className="lp-collection-card-count">{col.productCount} items</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SERVICE CAROUSEL */}
      <section id="services">
        <div className="container">
          <div className="section-header center">
            <span className="section-tag">What We Offer</span>
            <h2 className="section-title">Our <span className="gold-text">Print</span> Services</h2>
            <p className="section-subtitle">From apparel to promotional materials — we bring your ideas to life with precision printing at prices that won't break the bank.</p>
          </div>
        </div>
        <div style={{position:'relative'}}>
          {hoveredService !== null && (
            <div style={{ position:'fixed', top:tooltipY-8, left:tooltipX, transform:'translate(-50%,-100%)', width:'240px',
              background:'linear-gradient(135deg,var(--dark) 0%,var(--dark2) 100%)', border:'1px solid var(--gold)',
              borderRadius:'14px', padding:'1rem 1.25rem', zIndex:9999,
              boxShadow:'0 12px 40px rgba(0,0,0,0.85),0 0 0 1px rgba(212,168,67,0.15)',
              fontSize:'0.82rem', color:'rgba(255,255,255,0.75)', lineHeight:'1.65', pointerEvents:'none' }}>
              <div style={{position:'absolute',top:0,left:'10%',right:'10%',height:'2px',background:'linear-gradient(90deg,transparent,var(--gold),transparent)',borderRadius:'999px'}}/>
              <div style={{position:'absolute',bottom:'-7px',left:'50%',transform:'translateX(-50%)',width:'12px',height:'7px',overflow:'hidden'}}>
                <div style={{width:'10px',height:'10px',background:'var(--dark)',border:'1px solid var(--gold)',transform:'rotate(45deg)',marginTop:'-5px',marginLeft:'1px'}}/>
              </div>
              <strong style={{color:'var(--gold)',display:'block',marginBottom:'0.5rem',fontSize:'0.9rem',fontWeight:'700'}}>
                {services[hoveredService % services.length]?.title}
              </strong>
              {services[hoveredService % services.length]?.desc}
            </div>
          )}
          <div className="services-carousel-wrapper">
            <div className="services-carousel-track">
              {[...services, ...services].map((s, i) => (
                <div className="service-slide" key={i}
                  onMouseEnter={(e) => { setHoveredService(i); const r = e.currentTarget.getBoundingClientRect(); setTooltipX(r.left+r.width/2); setTooltipY(r.top-10); }}
                  onMouseLeave={() => setHoveredService(null)}>
                  <div className="service-slide-img-wrap"><img src={s.img} alt={s.title} className="service-slide-img"/></div>
                  <h3>{s.title}</h3>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="hiw-new-section">
        <div className="hiw-new-layout">

          {/* Left sticky column */}
          <div className="hiw-left">
            <span className="section-tag">Simple Process</span>
            <h2>How It <span className="red-text">Works</span></h2>
            <p>From idea to your hands in four simple steps.</p>
            <button className="btn-primary" onClick={handleEnterShop}>
              Get Started
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>

          {/* Right steps column */}
          <div className="hiw-new-steps">

            <div className="hiw-new-step">
              <div className="hiw-new-step-num">
                <span className="hiw-new-step-n">01</span>
                <svg className="hiw-new-step-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
              <div>
                <p className="hiw-new-step-title">Browse Products</p>
                <p className="hiw-new-step-desc">Explore our full catalogue of personalizable items — shirts, mugs, bags, stickers, and more.</p>
              </div>
            </div>

            <div className="hiw-new-step">
              <div className="hiw-new-step-num">
                <span className="hiw-new-step-n">02</span>
                <svg className="hiw-new-step-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
              </div>
              <div>
                <p className="hiw-new-step-title">Personalize It</p>
                <p className="hiw-new-step-desc">Add your name, message, or upload a design. We handle every detail to make it uniquely yours.</p>
              </div>
            </div>

            <div className="hiw-new-step">
              <div className="hiw-new-step-num">
                <span className="hiw-new-step-n">03</span>
                <svg className="hiw-new-step-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
              </div>
              <div>
                <p className="hiw-new-step-title">Place Your Order</p>
                <p className="hiw-new-step-desc">Review your item and check out. We confirm every order and send a proof before production.</p>
              </div>
            </div>

            <div className="hiw-new-step">
              <div className="hiw-new-step-num">
                <span className="hiw-new-step-n">04</span>
                <svg className="hiw-new-step-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <div>
                <p className="hiw-new-step-title">Receive &amp; Enjoy</p>
                <p className="hiw-new-step-desc">Your personalized item is crafted with care and delivered straight to your door.</p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* WHY US */}
      <section id="why-us" className="why-us">
        <div className="container">
          <div className="features-layout">
            <div>
              <div className="section-header">
                <span className="section-tag">Why Choose Us</span>
                <h2 className="section-title">Quality You Can <span className="gold-text">Feel</span></h2>
                <p className="section-subtitle">We're not just a print shop — we're your creative partner. Every order is handled with care, precision, and pride.</p>
              </div>
              <div className="feature-list">
                {[
                  {title:'Affordable Pricing',    desc:'Premium prints at prices that make sense. No hidden fees, no overpricing.'},
                  {title:'Fast Turnaround',        desc:'Most orders ready within 24–48 hours. Rush orders? We can make it work.'},
                  {title:'Design Assistance',      desc:'No designer? No problem. Request a design and our team will create it for you.'},
                  {title:'Approval Before Print',  desc:'You see and approve the final design before we print — 100% satisfaction guaranteed.'},
                ].map((f, i) => (
                  <div className="feature-item fade-up" key={i}>
                    <div className="feature-check">✓</div>
                    <div><h4>{f.title}</h4><p>{f.desc}</p></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="feature-visual">
              <div className="feature-card-stack">
                <div className="fcard"><div className="fcard-inner">
                  <div className="fcard-label">Total Orders</div>
                  <div className="fcard-value gold-text">1,240+</div>
                  <div className="fcard-bar"><div className="fcard-bar-fill" style={{width:'82%',background:'linear-gradient(90deg,var(--gold-dark),var(--gold))'}}/></div>
                </div></div>
                <div className="fcard"><div className="fcard-inner">
                  <div className="fcard-label">Satisfaction Rate</div>
                  <div className="fcard-value red-text">98.5%</div>
                  <div className="fcard-bar"><div className="fcard-bar-fill" style={{width:'98%',background:'linear-gradient(90deg,var(--red-dark),var(--red))'}}/></div>
                </div></div>
                <div className="fcard"><div className="fcard-inner">
                  <div className="fcard-label">Avg. Delivery</div>
                  <div className="fcard-value gold-text">24 hrs</div>
                  <div style={{fontSize:'.75rem',color:'var(--gray)',marginTop:'.5rem'}}>Rush orders available</div>
                </div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CUSTOMER REVIEWS */}
      {landingReviews.length > 0 && (
        <section className="reviews-landing-section">
          <div className="container">
            <div className="section-header center">
              <span className="section-tag">Customer Reviews</span>
              <h2 className="section-title">What Our <span className="gold-text">Customers</span> Say</h2>
              <p className="section-subtitle">Real feedback from real customers who ordered with us.</p>
            </div>
            <div className="reviews-carousel-wrap">
              <button
                className="reviews-arrow reviews-arrow-left"
                onClick={() => setReviewsIdx(i => Math.max(0, i - 1))}
                disabled={reviewsIdx === 0}
                aria-label="Previous reviews"
              >&#8249;</button>
              <div className="reviews-track-outer">
                <div
                  className="reviews-track"
                  style={{ transform: `translateX(-${reviewsIdx * (100 / 3)}%)` }}
                >
                  {landingReviews.map((rv, i) => (
                    <div className="review-card" key={i}>
                      <div className="review-stars">
                        {[1,2,3,4,5].map(s => (
                          <span key={s} style={{ color: s <= rv.rating ? 'var(--gold)' : 'rgba(255,255,255,0.2)', fontSize: '1rem' }}>★</span>
                        ))}
                      </div>
                      <p className="review-comment">&ldquo;{rv.comment}&rdquo;</p>
                      <div className="review-meta">
                        <span className="review-name">{rv.customerName}</span>
                        {rv.created_at && (
                          <span className="review-date">
                            {new Date(rv.created_at).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button
                className="reviews-arrow reviews-arrow-right"
                onClick={() => setReviewsIdx(i => Math.min(landingReviews.length - 1, i + 1))}
                disabled={reviewsIdx >= landingReviews.length - 3}
                aria-label="Next reviews"
              >&#8250;</button>
            </div>
            <div className="reviews-dots">
              {Array.from({ length: Math.max(0, landingReviews.length - 2) }).map((_, i) => (
                <button
                  key={i}
                  className={`reviews-dot${reviewsIdx === i ? ' active' : ''}`}
                  onClick={() => setReviewsIdx(i)}
                  aria-label={`Go to review ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* PRICING */}
      <section id="pricing" className="pricing-bg">
        <div className="container">
          <div className="section-header center">
            <span className="section-tag">Transparent Pricing</span>
            <h2 className="section-title">Our <span className="gold-text">Price</span> List</h2>
            <p className="section-subtitle">Starting prices for all our products. Login or Register to view the complete pricelist with bulk pricing breakdowns.</p>
          </div>
          <div className="pricing-new-layout">
            {/* Left — unlock card */}
            <div className="pricing-unlock-card">
              <div className="pricing-unlock-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <h3>Full Pricelist</h3>
              <p>Unlock bulk pricing breakdowns for all our products and services.</p>
              <button className="btn-primary" onClick={() => { setLoginFromPricing(true); openModal('login'); }}>Login to View</button>
              <button className="btn-secondary" onClick={() => { setLoginFromPricing(true); openModal('register'); }}>Register Free</button>
            </div>

            {/* Right — pricing grid */}
            <div className="pub-pricing-grid">
              {publicPricing.map((item, i) => (
                <div className="pub-pricing-card fade-up" key={i}>
                  <div className="pub-pricing-top">
                    <h4 className="pub-pricing-name">{item.category}</h4>
                    <div className="pub-pricing-starts">
                      <span className="pub-pricing-label">Starts at</span>
                      <span className="pub-pricing-amount gold-text">{item.startingAt}</span>
                    </div>
                  </div>
                  <p className="pub-pricing-note">{item.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="contact-bg">
        <div className="container">
          <div className="section-header center">
            <h2 className="section-title">Let's <span className="red-text">Talk</span></h2>
            <p className="section-subtitle">Have a question, a bulk order, or a custom request? We'd love to hear from you.</p>
          </div>
          <div className="contact-layout">
            <div className="contact-info">
              <div className="contact-info-card">
                <div className="contact-info-icon" style={{color:'var(--gold)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div><h4>Message Us</h4><p>Facebook, Instagram, TikTok</p><p style={{fontSize:'.78rem',color:'var(--gray)',marginTop:'.2rem'}}>@personalizemeprints</p></div>
              </div>
              <div className="contact-info-card">
                <div className="contact-info-icon" style={{color:'var(--gold)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <div><h4>Business Hours</h4><p>Mon - Sat: 9:00 AM - 6:00 PM</p><p style={{fontSize:'.78rem',color:'var(--gray)',marginTop:'.2rem'}}>Sunday: By Appointment</p></div>
              </div>
              <div className="contact-info-card">
                <div className="contact-info-icon" style={{color:'var(--gold)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                  </svg>
                </div>
                <div><h4>Shop Online</h4><a href="https://shopee.ph/personalizemeprints" target="_blank" rel="noopener noreferrer" className="auth-link">Shopee: personalizemeprints</a></div>
              </div>
              <div className="contact-socials">
                <a href="https://www.facebook.com/share/1Mks4kwnhZ/?mibextid=wwXIfr" className="contact-social-btn" target="_blank" rel="noopener noreferrer">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
                  Facebook
                </a>
                <a href="https://www.instagram.com/personalizemeprints" className="contact-social-btn" target="_blank" rel="noopener noreferrer">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
                  Instagram
                </a>
                <a href="https://www.tiktok.com/@personalizemeprints" className="contact-social-btn" target="_blank" rel="noopener noreferrer">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg>
                  TikTok
                </a>
              </div>
            </div>
            <div className="contact-form-wrap">
              {contactSent ? (
                <div className="contact-success">
                  <div className="contact-success-icon" style={{color:'var(--green)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </div>
                  <h3>Message Sent!</h3>
                  <p>Thanks for reaching out! We'll get back to you within 24 hours.</p>
                  <button type="button" className="btn-primary" onClick={() => { setContactSent(false); setContactErrors({}); }} style={{marginTop: '1rem'}}>
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form className="contact-form" onSubmit={handleContactSubmit}>
                  <div className="contact-fields-row">
                    <div className="auth-field">
                      <label>Your Name</label>
                      <input type="text" placeholder="Juan Dela Cruz" value={contactForm.name} onChange={(e) => handleContactChange('name', e.target.value)} className={contactErrors.name ? 'error' : ''} maxLength={120}/>
                      {contactErrors.name && <span className="error-message">{contactErrors.name}</span>}
                    </div>
                    <div className="auth-field">
                      <label>Email Address</label>
                      <input type="email" placeholder="you@example.com" value={contactForm.email} onChange={(e) => handleContactChange('email', e.target.value)} className={contactErrors.email ? 'error' : ''}/>
                      {contactErrors.email && <span className="error-message">{contactErrors.email}</span>}
                    </div>
                  </div>
                  <div className="auth-field">
                    <label>Subject</label>
                    <input type="text" placeholder="Bulk order inquiry, custom design, etc." value={contactForm.subject} onChange={(e) => handleContactChange('subject', e.target.value)} className={contactErrors.subject ? 'error' : ''} maxLength={200}/>
                    {contactErrors.subject && <span className="error-message">{contactErrors.subject}</span>}
                  </div>
                  <div className="auth-field">
                    <label>Message</label>
                    <textarea placeholder="Tell us about your order, design, ideas, or any questions you have..." value={contactForm.message} onChange={(e) => handleContactChange('message', e.target.value)} className={`contact-textarea ${contactErrors.message ? 'error' : ''}`} rows={5} maxLength={5000}/>
                    {contactErrors.message && <span className="error-message">{contactErrors.message}</span>}
                  </div>
                  <button type="submit" className="btn-primary contact-submit-btn">
                    Send Message
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </form>
              )}
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
              <button className="btn-primary" onClick={handleEnterShop}>
                Browse Products
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <a href="#services" className="btn-secondary">View Services</a>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-footer-brand-name">PERSONALIZE <span>ME</span> PRINTS</div>
            <p className="lp-footer-tagline">Your creative partner for custom print products. Quality printing for every occasion.</p>
            <div className="lp-footer-socials">
              <img src="/logos/PersonalizeMe logo.png" alt="Logo" className="lp-footer-logo" />
              <a href="https://www.facebook.com/share/1Mks4kwnhZ/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer" className="lp-footer-social-btn" aria-label="Facebook">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
              </a>
              <a href="https://www.instagram.com/personalizemeprints" target="_blank" rel="noopener noreferrer" className="lp-footer-social-btn" aria-label="Instagram">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
              </a>
              <a href="https://www.tiktok.com/@personalizemeprints" target="_blank" rel="noopener noreferrer" className="lp-footer-social-btn" aria-label="TikTok">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg>
              </a>
              <a href="https://shopee.ph/personalizemeprints" target="_blank" rel="noopener noreferrer" className="lp-footer-social-btn" aria-label="Shopee">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6zm3 9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
              </a>
            </div>
          </div>
          <div className="lp-footer-col">
            <h4>Explore</h4>
            <a href="#services">Products</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#pricing">Pricing</a>
            <a href="#contact">Contact Us</a>
          </div>
          <div className="lp-footer-col">
            <h4>Shop</h4>
            <a href="/shop" onClick={handleEnterShop}>Browse Products</a>
            <a href="/shop" onClick={handleEnterShop}>Collections</a>
            <a href="/shop/cart" onClick={handleEnterShop}>My Cart</a>
          </div>
          <div className="lp-footer-col">
            <h4>Accepted Payments</h4>
            <div className="lp-footer-pay-grid">
              <img src="/logos/Gcash-Logo-1024x1024.png" alt="GCash" className="lp-footer-pay-badge" />
              <img src="/logos/maya logo.png" alt="Maya" className="lp-footer-pay-badge" />
              <svg viewBox="0 0 780 500" xmlns="http://www.w3.org/2000/svg" className="lp-footer-pay-visa">
                <rect width="780" height="500" rx="40" fill="#1a1f71"/>
                <text x="390" y="340" textAnchor="middle" fontFamily="Arial" fontSize="240" fontWeight="bold" fill="#fff" fontStyle="italic">VISA</text>
              </svg>
              <svg viewBox="0 0 60 38" xmlns="http://www.w3.org/2000/svg" className="lp-footer-pay-mc">
                <rect width="60" height="38" rx="4" fill="#252525"/>
                <circle cx="23" cy="19" r="13" fill="#EB001B"/>
                <circle cx="37" cy="19" r="13" fill="#F79E1B"/>
                <path d="M30 8.8a13 13 0 0 1 0 20.4A13 13 0 0 1 30 8.8z" fill="#FF5F00"/>
              </svg>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span className="lp-footer-copy">© {new Date().getFullYear()} Personalize Me Prints. All rights reserved.</span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', cursor: 'pointer', color: 'rgba(245,245,245,0.6)', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem' }}
          >
            {theme === 'dark' ? (
              <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>Light</>
            ) : (
              <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>Dark</>
            )}
          </button>
          <div className="lp-footer-legal">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
          </div>
        </div>
      </footer>

      {/* ── AUTH MODAL ── */}
      {modal && (
        <div className="auth-overlay" onClick={closeModal}>
          <div className="auth-modal" onClick={e => e.stopPropagation()}>

            {/* LOGIN */}
            {modal === 'login' && (
              <>
                <div className="auth-modal-header">
                  <img src="/logos/PersonalizeMe logo.png" alt="Logo" className="auth-modal-logo"/>
                  <div><h2>Welcome Back!</h2><p>Login to your Account</p></div>
                  <button className="auth-close" onClick={closeModal}>✕</button>
                </div>
                <div className="auth-modal-body">
                  {sessionMessage && (
                    <div style={{
                      background: 'var(--color-background-warning)',
                      color: 'var(--color-text-warning)',
                      border: '1px solid var(--color-border-warning)',
                      borderRadius: '8px',
                      padding: '0.75rem 1rem',
                      fontSize: '0.9rem',
                      marginBottom: '1rem'
                    }}>
                      {sessionMessage}
                    </div>
                  )}
                  <form onSubmit={handleLoginSubmit}>
                    <div className="auth-field">
                      <label>Email Address</label>
                      <input type="email" placeholder="you@example.com"
                        value={loginForm.email}
                        onChange={e => { setLoginForm(f => ({...f, email: e.target.value})); setLoginErrors({}); setSessionMessage(''); }}
                        className={loginErrors.email ? 'error' : ''}/>
                      {loginErrors.email && <span className="error-message">{loginErrors.email}</span>}
                    </div>
                    <div className="auth-field">
                      <label>Password</label>
                      <div className="auth-input-wrap">
                        <input type={showPassword ? 'text' : 'password'} placeholder="Enter your password"
                          value={loginForm.password} maxLength={128}
                          onChange={e => { setLoginForm(f => ({...f, password: e.target.value})); setLoginErrors({}); setSessionMessage(''); }}
                          className={loginErrors.password ? 'error' : ''}/>
                        <button type="button" className="auth-eye" onClick={() => setShowPassword(v => !v)}>
                          {showPassword ? <EyeOpen/> : <EyeClosed/>}
                        </button>
                      </div>
                      {loginErrors.password && <span className="error-message">{loginErrors.password}</span>}
                    </div>
                    <div className="auth-row">
                      <label className="auth-check" style={{display:'flex', alignItems:'center'}}>
                        <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}/>
                        <span>Remember Me</span>
                        <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                          width:'14px', height:'14px', borderRadius:'50%', verticalAlign:'middle',
                          background:'var(--border)', color:'var(--gray)', fontSize:'0.65rem',
                          marginLeft:'4px', cursor:'help', flexShrink: 0 }}
                          title="Keep you logged in for 30 days. Don't use on shared devices.">?</span>
                      </label>
                      <button type="button" className="auth-link"
                        onClick={() => { setModal(null); setForgotModal(true); setForgotEmail(''); setForgotError(''); setForgotSent(false); setForgotStep(1); setForgotCode(''); setForgotNewPassword(''); setForgotConfirmPassword(''); }}>
                        Forgot Password
                      </button>
                    </div>
                    <button type="submit" className="btn-auth-submit" disabled={isLoggingIn}>
                      {isLoggingIn ? 'Signing In...' : 'Sign In'}
                    </button>
                  </form>
                  <p className="auth-switch">Don't have an account? <button type="button" onClick={() => setModal('register')}>Create one</button></p>
                </div>
              </>
            )}

            {/* REGISTER */}
            {modal === 'register' && (
              <>
                <div className="auth-modal-header">
                  <img src="/logos/PersonalizeMe logo.png" alt="Logo" className="auth-modal-logo"/>
                  <div><h2>Create Account</h2><p>Join Personalize Me Prints</p></div>
                  <button className="auth-close" onClick={closeModal}>✕</button>
                </div>
                <StepIndicator step={1}/>
                <div className="auth-modal-body">
                  <form onSubmit={(e) => { e.preventDefault(); }} autoComplete="off">
                    <div className="auth-fields-grid">
                      <div className="auth-field">
                        <label>First Name</label>
                        <input type="text" placeholder="Juan" value={registerForm.firstName}
                          onChange={e => handleRegisterChange('firstName', e.target.value)}
                          onBlur={e => handleRegisterChange('firstName', e.target.value.trim())}
                          className={errors.firstName ? 'error' : ''}/>
                        {errors.firstName && <span className="error-message">{errors.firstName}</span>}
                      </div>
                      <div className="auth-field">
                        <label>Middle Initial</label>
                        <input type="text" placeholder="D." value={registerForm.middleInitial}
                          onChange={e => handleRegisterChange('middleInitial', e.target.value.toUpperCase())}
                          maxLength="2" className={errors.middleInitial ? 'error' : ''}/>
                        {errors.middleInitial && <span className="error-message">{errors.middleInitial}</span>}
                      </div>
                      <div className="auth-field">
                        <label>Last Name</label>
                        <input type="text" placeholder="Dela Cruz" value={registerForm.lastName}
                          onChange={e => handleRegisterChange('lastName', e.target.value)}
                          onBlur={e => handleRegisterChange('lastName', e.target.value.trim())}
                          className={errors.lastName ? 'error' : ''}/>
                        {errors.lastName && <span className="error-message">{errors.lastName}</span>}
                      </div>
                    </div>

                    <div className="auth-field">
                      <label>Home Address</label>
                      <input type="text" placeholder="e.g. 123 Rizal Ave, Brgy. San Antonio, Caloocan"
                        value={registerForm.address}
                        onChange={e => handleRegisterChange('address', e.target.value)}
                        className={errors.address ? 'error' : ''}/>
                      {errors.address && <span className="error-message">{errors.address}</span>}
                      <span style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '0.3rem', display: 'block' }}>
                        For delivery, you&apos;ll add a pinned address in your profile after registering.
                      </span>
                    </div>

                    <div className="auth-field">
                      <label>Phone Number</label>
                      <div style={{display:'flex',borderRadius:'10px',overflow:'hidden',border:'1px solid var(--border)'}}>
                        <div style={{background:'var(--dark3)',borderRight:'1px solid var(--border)',padding:'0 1rem',display:'flex',alignItems:'center',color:'var(--white)',fontWeight:'700',fontSize:'0.95rem',flexShrink:0,userSelect:'none'}}>+63</div>
                        <input type="tel" placeholder="912 345 6789"
                          value={registerForm.phoneNumber.replace(/^\+63/, '')}
                          onChange={e => { const d = e.target.value.replace(/\D/g,'').slice(0,10); handleRegisterChange('phoneNumber', '+63'+d); }}
                          className={errors.phoneNumber ? 'error' : ''} maxLength={10}
                          style={{border:'none',borderRadius:'0',flex:'1',background:'transparent'}}/>
                      </div>
                      {errors.phoneNumber && <span className="error-message">{errors.phoneNumber}</span>}
                    </div>

                    <div className="auth-field">
                      <label>Email Address</label>
                      <input type="email" placeholder="you@example.com" value={registerForm.email}
                        onChange={e => handleRegisterChange('email', e.target.value)}
                        className={errors.email ? 'error' : ''}/>
                      {errors.email && <span className="error-message">{errors.email}</span>}
                    </div>

                    <div className="auth-fields-grid">
                      <div className="auth-field" style={{position:'relative'}}>
                        <label>Password</label>
                        <div className="auth-input-wrap">
                          <input type={showPassword ? 'text' : 'password'} placeholder="Create Password"
                            autoComplete="new-password" maxLength={64} value={registerForm.password}
                            onChange={e => handleRegisterChange('password', e.target.value)}
                            onFocus={() => setRegisterPasswordTouched(true)}
                            className={errors.password ? 'error' : ''}/>
                          <button type="button" className="auth-eye" onClick={() => setShowPassword(v => !v)}>
                            {showPassword ? <EyeOpen/> : <EyeClosed/>}
                          </button>
                        </div>
                        {(registerPasswordTouched || registerForm.password.length > 0) && (
                          <div style={{marginTop:'0.5rem',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',borderRadius:'10px',padding:'0.75rem'}}>
                            <div style={{display:'flex',flexDirection:'column',gap:'0.4rem'}}>
                              {[
                                {label:'At least 8 characters',    pass: registerForm.password.length >= 8},
                                {label:'One uppercase letter',      pass: /[A-Z]/.test(registerForm.password)},
                                {label:'One lowercase letter',      pass: /[a-z]/.test(registerForm.password)},
                                {label:'One number',                pass: /\d/.test(registerForm.password)},
                                {label:'One special character',     pass: /[!@#$%^&*(),.?":{}|<>]/.test(registerForm.password)},
                              ].map((c, i) => (
                                <div key={i} style={{display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'0.78rem',color:c.pass?'var(--green)':'var(--gray)',transition:'color 0.2s'}}>
                                  <span style={{fontSize:'0.72rem'}}>{c.pass ? '✓' : '·'}</span>{c.label}
                                </div>
                              ))}
                            </div>

                            <div style={{marginTop:'0.55rem'}}>
                              <PasswordStrength password={registerForm.password}/>
                            </div>
                          </div>
                        )}
                        {errors.password && <span className="error-message">{errors.password}</span>}
                      </div>

                      <div className="auth-field">
                        <label>Confirm Password</label>
                        <div className="auth-input-wrap">
                          <input type={showConfirm ? 'text' : 'password'} placeholder="Repeat Password"
                            autoComplete="new-password" value={registerForm.confirmPassword}
                            onChange={e => handleRegisterChange('confirmPassword', e.target.value)}
                            onFocus={() => setRegisterConfirmTouched(true)}
                            className={errors.confirmPassword ? 'error' : ''}/>
                          <button type="button" className="auth-eye" onClick={() => setShowConfirm(v => !v)}>
                            {showConfirm ? <EyeOpen/> : <EyeClosed/>}
                          </button>
                        </div>
                        {(registerConfirmTouched || registerForm.confirmPassword.length > 0) && (
                          <div style={{marginTop:'0.5rem',fontSize:'0.8rem',color: registerForm.confirmPassword.length === 0 ? 'var(--gray)' : (registerForm.confirmPassword === registerForm.password ? 'var(--green)' : 'var(--red)')}}>
                            {registerForm.confirmPassword.length === 0
                              ? 'Re-enter your password to confirm.'
                              : (registerForm.confirmPassword === registerForm.password ? '✓ Passwords match' : 'Passwords do not match')}
                          </div>
                        )}
                        {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
                      </div>
                    </div>

                    <button type="button" className="btn-auth-submit"
                      disabled={isRegistering || !!errors.email || !!errors.phoneNumber}
                      onClick={() => {
                        if (!validateForm()) return;
                        setHasReadTerms(false);
                        setTAndCModalOpen(true);
                        setTimeout(() => {
                          if (termsScrollRef.current) {
                            termsScrollRef.current.scrollTop = 0;
                          }
                        }, 50);
                      }}>
                      Proceed to Terms &amp; Conditions
                    </button>
                  </form>
                  <p className="auth-switch">Already have an account? <button onClick={() => setModal('login')}>Sign In</button></p>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* ── T&C MODAL ── */}
      {tAndCModalOpen && (
        <div className="tnc-overlay" onClick={() => { setTAndCModalOpen(false); setErrors({}); setHasReadTerms(false); setRegisterForm(f => ({...f, agreeToTerms: false})); }}>
          <div className="tnc-modal" onClick={e => e.stopPropagation()}>
            <div className="tnc-header">
              <h3>Terms and Conditions</h3>
              <button className="tnc-close" onClick={() => { setTAndCModalOpen(false); setErrors({}); setHasReadTerms(false); setRegisterForm(f => ({...f, agreeToTerms: false})); }}>✕</button>
            </div>
            <StepIndicator step={2}/>
            {!hasReadTerms && (
              <p style={{fontSize:'0.8rem',color:'var(--gray)',marginBottom:'0.5rem',textAlign:'center',fontStyle:'italic'}}>
                Please scroll to the bottom to accept the terms.
              </p>
            )}
            <div className="tnc-content" ref={termsScrollRef} onScroll={handleTermsScroll}>
              <p><strong>1. Acceptance of Terms</strong></p>
              <p>By creating an account with Personalize Me Prints, you agree to comply with and be bound by these Terms and Conditions. If you do not agree with any part of these terms, please do not use our services.</p>
              <p><strong>2. Account Registration</strong></p>
              <p>You must provide accurate and complete information when registering for an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</p>
              <p><strong>3. Product Quality</strong></p>
              <p>We strive to provide high-quality custom printing services. All products are subject to quality inspection before shipment. We are not responsible for damages caused by improper use or handling of printed products.</p>
              <p><strong>4. Intellectual Property</strong></p>
              <p>You warrant that any designs or content you upload for printing do not infringe upon any third-party rights. You grant us a non-exclusive license to use your designs solely for the purpose of fulfilling your order.</p>
              <p><strong>5. Payment and Pricing</strong></p>
              <p>All prices are subject to change without notice. Payment is required before production begins. We reserve the right to refuse any order for any reason.</p>
              <p><strong>6. Shipping and Delivery</strong></p>
              <p>Delivery times are estimates and not guaranteed. We are not responsible for delays caused by shipping carriers or customs processing.</p>
              <p><strong>7. Returns and Refunds</strong></p>
              <p>Due to the custom nature of our products, all sales are final. We will only accept returns or provide refunds for products that are damaged or significantly different from the approved proof.</p>
              <p><strong>8. Limitation of Liability</strong></p>
              <p>Personalize Me Prints shall not be liable for any indirect, incidental, or consequential damages arising from the use of our products or services.</p>
              <p><strong>9. Changes to Terms</strong></p>
              <p>We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting on our website. Your continued use of our services after any changes constitutes acceptance of the new terms.</p>
            </div>
            {hasReadTerms && (
              <div style={{padding:'1rem 1.5rem',borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'0.75rem'}}>
                <input type="checkbox" id="tnc-agree-inside" checked={registerForm.agreeToTerms}
                  onChange={e => handleRegisterChange('agreeToTerms', e.target.checked)}
                  style={{width:'16px',height:'16px',cursor:'pointer',accentColor:'var(--gold)',flexShrink:0}}/>
                <label htmlFor="tnc-agree-inside" style={{fontSize:'0.88rem',color:'var(--white)',cursor:'pointer',userSelect:'none'}}>
                  I have read and agree to the Terms and Conditions
                </label>
              </div>
            )}
            <div className="tnc-actions">
              {hasReadTerms && (
                <button className="btn-primary" disabled={!registerForm.agreeToTerms || isRegistering}
                  onClick={async () => { setTAndCModalOpen(false); setErrors({}); await handleRegisterSubmit({preventDefault: () => {}}); }}>
                  {isRegistering ? 'Creating Account...' : 'Create Account'}
                </button>
              )}
              <button className="btn-secondary" onClick={() => { setTAndCModalOpen(false); setErrors({}); setHasReadTerms(false); setRegisterForm(f => ({...f, agreeToTerms: false})); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── FORGOT PASSWORD MODAL ── */}
      {forgotModal && (
        <div className="auth-overlay" onClick={() => { setForgotModal(false); setForgotStep(1); setForgotPasswordTouched(false); setForgotConfirmTouched(false); }}>
          <div className="auth-modal" onClick={e => e.stopPropagation()} style={{maxWidth:'420px'}}>
            <div className="auth-modal-header">
              <img src="/logos/PersonalizeMe logo.png" alt="Logo" className="auth-modal-logo"/>
              <div>
                <h2>Forgot Password</h2>
                <p>
                  {forgotStep === 1 ? "We'll send you a reset link" : 
                   forgotStep === 2 ? "Confirm it's you" : 
                   forgotStep === 3 ? "Enter verification code" : "Set a new password"}
                </p>
              </div>
              <button className="auth-close" onClick={() => { setForgotModal(false); setForgotStep(1); setForgotPasswordTouched(false); setForgotConfirmTouched(false); }}>✕</button>
            </div>
            <div className="auth-modal-body">

              {/* STEP 1 — Enter Email */}
              {forgotStep === 1 && (
                <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
                  <p style={{color:'var(--gray)',fontSize:'0.9rem',lineHeight:'1.6',margin:0}}>
                    Enter the email address associated with your account and we'll send you a password reset link.
                  </p>
                  <div className="auth-field">
                    <label>Email Address</label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={forgotEmail}
                      onChange={e => { setForgotEmail(e.target.value); setForgotError(''); }}
                      className={forgotError ? 'error' : ''}
                      onKeyDown={e => e.key === 'Enter' && handleForgotSubmit()}
                    />
                    {forgotError && <span className="error-message">{forgotError}</span>}
                  </div>
                  {forgotSent && (
                    <div style={{padding:'0.75rem',borderRadius:'8px',background:'rgba(74,222,128,0.12)',border:'1px solid rgba(74,222,128,0.3)',color:'var(--green)',fontSize:'0.85rem'}}>
                      ✓ A reset link has been sent to your email.
                    </div>
                  )}
                  <button className="btn-auth-submit" disabled={isSendingReset} onClick={handleForgotSubmit}>
                    {isSendingReset ? 'Sending...' : 'Send Reset Link'}
                  </button>
                  <p className="auth-switch" style={{margin:0}}>
                    Remember your password?{' '}
                    <button type="button" onClick={() => { setForgotModal(false); setForgotStep(1); openModal('login'); }}>Sign In</button>
                  </p>
                </div>
              )}

              {/* STEP 2 — Confirm it's you (shown after clicking link from email) */}
              {forgotStep === 2 && (
                <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
                  <div style={{textAlign:'center',padding:'0.5rem 0'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',width:'64px',height:'64px',borderRadius:'50%',background:'rgba(212,168,67,0.1)',border:'1px solid rgba(212,168,67,0.25)',margin:'0 auto 1rem'}}>
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <circle cx="12" cy="5" r="2"/>
                        <path d="M12 7v4"/>
                      </svg>
                    </div>
                    <p style={{color:'var(--gray)',fontSize:'0.88rem',lineHeight:'1.6',margin:0}}>
                      Are you the user who wants to reset the password for<br/>
                      <strong style={{color:'var(--white)',fontSize:'0.95rem'}}>{forgotEmail}</strong>?
                    </p>
                  </div>
                  {forgotError && (
                    <div style={{padding:'0.75rem',borderRadius:'8px',background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.3)',color:'var(--red)',fontSize:'0.85rem'}}>
                      {forgotError}
                    </div>
                  )}
                  <div style={{display:'flex',gap:'0.75rem',marginTop:'0.5rem'}}>
                    <button 
                      className="btn-auth-submit" 
                      disabled={isSendingReset} 
                      onClick={() => { handleSendResetCode(); }}
                      style={{flex:1}}
                    >
                      {isSendingReset ? 'Sending...' : 'Yes, Reset My Password'}
                    </button>
                    <button 
                      type="button"
                      className="btn-auth-submit"
                      onClick={() => { setForgotModal(false); setForgotStep(1); }}
                      style={{flex:1,background:'transparent',border:'1px solid var(--border)'}}
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="auth-switch" style={{margin:0}}>
                    Didn't request this?{' '}
                    <button type="button" onClick={() => { setForgotModal(false); setForgotStep(1); }}>Report it</button>
                  </p>
                </div>
              )}

              {/* STEP 3 — Enter Verification Code */}
              {forgotStep === 3 && (
                <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
                  <div style={{textAlign:'center',padding:'0.5rem 0'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',width:'64px',height:'64px',borderRadius:'50%',background:'rgba(212,168,67,0.1)',border:'1px solid rgba(212,168,67,0.25)',margin:'0 auto 1rem'}}>
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                    </div>
                    <p style={{color:'var(--gray)',fontSize:'0.88rem',lineHeight:'1.6',margin:0}}>
                      We sent a 6-digit code to <strong style={{color:'var(--white)'}}>{forgotEmail}</strong>. Check your inbox and spam folder.
                    </p>
                  </div>
                  <div className="auth-field">
                    <label>6-Digit Verification Code</label>
                    <input
                      type="text"
                      placeholder="Enter 6-digit code"
                      maxLength={6}
                      value={forgotCode}
                      onChange={e => { setForgotCode(e.target.value.replace(/\D/g,'')); setForgotError(''); }}
                      className={forgotError ? 'error' : ''}
                      style={{letterSpacing:'0.25em',fontSize:'1.1rem',textAlign:'center'}}
                      onKeyDown={e => e.key === 'Enter' && handleForgotVerifyCode()}
                    />
                    {forgotError && <span className="error-message">{forgotError}</span>}
                    {forgotResendSuccess && (
                      <span style={{display:'block',fontSize:'0.8rem',color:'var(--green)',marginTop:'0.4rem'}}>✓ A new code has been sent</span>
                    )}
                  </div>
                  <button className="btn-auth-submit" disabled={isSendingReset} onClick={handleForgotVerifyCode}>
                    {isSendingReset ? 'Verifying...' : 'Verify Code'}
                  </button>
                  <p className="auth-switch" style={{margin:0}}>
                    Didn't receive the code?{' '}
                    <button
                      type="button"
                      className="auth-link"
                      disabled={forgotResendCooldown > 0 || isForgotResending}
                      style={(forgotResendCooldown > 0 || isForgotResending)
                        ? {opacity:0.5,cursor:'not-allowed'}
                        : {}}
                      onClick={handleForgotResend}
                    >
                      {isForgotResending
                        ? 'Sending...'
                        : forgotResendCooldown > 0
                          ? `Resend in ${forgotResendCooldown}s`
                          : 'Resend Code'}
                    </button>
                  </p>
                </div>
              )}

              {/* STEP 4 — New Password */}
              {forgotStep === 4 && (
                <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
                  <p style={{color:'var(--gray)',fontSize:'0.9rem',lineHeight:'1.6',margin:0}}>
                    Create a strong new password for your account.
                  </p>
                  <div className="auth-field">
                    <label>New Password</label>
                    <div className="auth-input-wrap">
                      <input
                        type={showForgotPassword ? 'text' : 'password'}
                        placeholder="Enter new password"
                        maxLength={64}
                        value={forgotNewPassword}
                        onChange={e => { setForgotNewPassword(e.target.value); setForgotError(''); }}
                        onFocus={() => setForgotPasswordTouched(true)}
                        className={forgotError ? 'error' : ''}
                      />
                      <button type="button" className="auth-eye" onClick={() => setShowForgotPassword(v => !v)}>
                        {showForgotPassword ? <EyeOpen/> : <EyeClosed/>}
                      </button>
                    </div>
                    {(forgotPasswordTouched || forgotNewPassword.length > 0) && (
                      <div style={{marginTop:'0.5rem',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',borderRadius:'10px',padding:'0.75rem'}}>
                        <div style={{display:'flex',flexDirection:'column',gap:'0.4rem'}}>
                          {[
                            {label:'At least 8 characters',    pass: forgotNewPassword.length >= 8},
                            {label:'One uppercase letter',      pass: /[A-Z]/.test(forgotNewPassword)},
                            {label:'One lowercase letter',      pass: /[a-z]/.test(forgotNewPassword)},
                            {label:'One number',                pass: /\d/.test(forgotNewPassword)},
                            {label:'One special character',     pass: /[!@#$%^&*(),.?":{}|<>]/.test(forgotNewPassword)},
                          ].map((c, i) => (
                            <div key={i} style={{display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'0.78rem',color:c.pass?'var(--green)':'var(--gray)',transition:'color 0.2s'}}>
                              <span style={{fontSize:'0.72rem'}}>{c.pass ? '✓' : '·'}</span>{c.label}
                            </div>
                          ))}
                        </div>
                        <div style={{marginTop:'0.55rem'}}>
                          <PasswordStrength password={forgotNewPassword}/>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="auth-field">
                    <label>Confirm New Password</label>
                    <div className="auth-input-wrap">
                      <input
                        type={showForgotConfirm ? 'text' : 'password'}
                        placeholder="Repeat new password"
                        maxLength={64}
                        value={forgotConfirmPassword}
                        onChange={e => { setForgotConfirmPassword(e.target.value); setForgotError(''); }}
                        onFocus={() => setForgotConfirmTouched(true)}
                        className={forgotError ? 'error' : ''}
                      />
                      <button type="button" className="auth-eye" onClick={() => setShowForgotConfirm(v => !v)}>
                        {showForgotConfirm ? <EyeOpen/> : <EyeClosed/>}
                      </button>
                    </div>
                    {(forgotConfirmTouched || forgotConfirmPassword.length > 0) && (
                      <div style={{marginTop:'0.5rem',fontSize:'0.8rem',color: forgotConfirmPassword.length === 0 ? 'var(--gray)' : (forgotConfirmPassword === forgotNewPassword ? 'var(--green)' : 'var(--red)')}}>
                        {forgotConfirmPassword.length === 0
                          ? 'Re-enter your new password to confirm.'
                          : (forgotConfirmPassword === forgotNewPassword ? '✓ Passwords match' : 'Passwords do not match')}
                      </div>
                    )}
                    {forgotError && <span className="error-message">{forgotError}</span>}
                  </div>
                  <button className="btn-auth-submit" disabled={isSendingReset} onClick={handleForgotResetPassword}>
                    {isSendingReset ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── PRICELIST MODAL ── */}
      {pricelistModalOpen && (
        <div className="auth-overlay" onClick={() => setPricelistModalOpen(false)}>
          <div className="pricelist-modal" onClick={e => e.stopPropagation()}>
            <div className="pricelist-modal-header">
              <div><h2>Complete Pricelist</h2><p>All products with full bulk pricing</p></div>
              <button className="auth-close" onClick={() => setPricelistModalOpen(false)}>✕</button>
            </div>
            <div className="pricelist-modal-body">
              {fullPricelist.map((item, i) => (
                <div className="pl-item" key={i}>
                  <div className="pl-item-header">
                    <h3>{item.category}</h3>
                    {item.note && <p className="pl-item-note">{item.note}</p>}
                    {item.startingAt && <span className="pl-starting gold-text">Starts At {item.startingAt}</span>}
                  </div>
                  {item.tiers && (
                    <div className="pl-tiers">
                      {item.tiers.map(([qty, price], j) => (
                        <div className="pl-tier-row" key={j}>
                          <span className="pl-qty">{qty}</span><span className="pl-dash">—</span><span className="pl-price gold-text">₱{price}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {item.variants && (
                    <div className="pl-variants">
                      {item.variants.map((v, j) => (
                        <div className="pl-variant" key={j}>
                          <h4>{v.name}</h4>
                          <div className="pl-tiers">
                            {v.tiers.map(([qty, price], k) => (
                              <div className="pl-tier-row" key={k}>
                                <span className="pl-qty">{qty}</span><span className="pl-dash">—</span><span className="pl-price gold-text">₱{price}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── EMAIL VERIFICATION ── */}
      {verificationModal && (
        <div className="auth-overlay" onClick={() => setVerificationModal(false)}>
          <div className="verify-modal" onClick={e => e.stopPropagation()}>
            <div className="verify-icon-wrap">
              <div className="verify-icon" style={{color:'var(--gold)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <div className="verify-pulse"/>
            </div>
            <h2 className="verify-title">Account Created!</h2>
            <p className="verify-subtitle">We sent a 6-digit verification code to {registeredEmail}. Enter it below to activate your account.</p>
            <div className="verify-email-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              {registeredEmail}
            </div>
            <div className="verify-code-wrap">
              <input type="text" className="verify-code-input" placeholder="Enter 6-digit code" maxLength={6}
                value={verificationCode} onChange={e => setVerificationCode(e.target.value.replace(/\D/g, ''))}/>
              {verifyError   && <span className="error-message" style={{display:'block',marginTop:'0.4rem',textAlign:'center'}}>{verifyError}</span>}
              {resendSuccess && <span style={{display:'block',fontSize:'0.8rem',color:'var(--color-text-success)',background:'var(--color-background-success)',border:'1px solid var(--color-border-success)',padding:'0.5rem 0.75rem',borderRadius:'6px',marginTop:'0.4rem',textAlign:'center'}}>A new code has been sent to your email.</span>}
            </div>
            <div className="verify-steps">
              <div className="verify-step"><div className="verify-step-num">1</div><span>Check your inbox (and spam folder)</span></div>
              <div className="verify-step"><div className="verify-step-num">2</div><span>Enter the 6-digit code</span></div>
              <div className="verify-step"><div className="verify-step-num">3</div><span>Click verify to activate your account</span></div>
            </div>
            <div className="verify-actions">
              <button
                className="btn-primary verify-login-btn"
                onClick={handleVerify}
                disabled={isVerifying}
                style={{
                  pointerEvents: isVerifying ? 'none' : 'auto',
                  opacity: isVerifying ? 0.6 : 1,
                  cursor: isVerifying ? 'not-allowed' : 'pointer',
                }}
              >
                {isVerifying ? 'Verifying...' : (
                  <>
                    Verify &amp; Login
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </>
                )}
              </button>
              <button className="btn-secondary" onClick={() => setVerificationModal(false)}>Close</button>
            </div>
            <p className="verify-send">
              Didn't receive the code?{' '}
              <button
                className="auth-link"
                disabled={resendCooldown > 0 || isResending}
                style={{
                  pointerEvents: resendCooldown > 0 || isResending ? 'none' : 'auto',
                  opacity: resendCooldown > 0 || isResending ? 0.5 : 1,
                  cursor: resendCooldown > 0 || isResending ? 'not-allowed' : 'pointer',
                }}
                onClick={handleResendCode}
              >
                {isResending
                  ? 'Sending...'
                  : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : 'Resend Code'}
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Chat bubble — login gate when not signed in */}
      <CustomerChatModal
        user={user}
        token={token}
        onRequestLogin={() => openModal('login')}
      />
    </>
  );
};

export default LandingPage;