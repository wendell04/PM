"use client";

import React, { useState, useEffect } from 'react';
import '@/components/custom-styles.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const PasswordChecklist = ({ password }) => {
  const checks = [
    { label: '8+ chars',     pass: password.length >= 8 },
    { label: 'Uppercase',    pass: /[A-Z]/.test(password) },
    { label: 'Lowercase',    pass: /[a-z]/.test(password) },
    { label: 'Number',       pass: /\d/.test(password) },
    { label: 'Special char', pass: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ];

 return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
      {checks.map((c, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
          fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '999px',
          background: c.pass ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${c.pass ? '#4ade80' : 'var(--border)'}`,
          color: c.pass ? '#4ade80' : 'var(--gray)', transition: 'all 0.2s',
        }}>
          {c.pass ? '✓' : '·'} {c.label}
        </span>
      ))}
    </div>
  );
};

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
    {label: 'Too Weak',    color: '#ef4444', width: '20%'},
    {label: 'Weak',        color: '#f97316', width: '40%'},
    {label: 'Fair',        color: '#eab308', width: '60%'},
    {label: 'Strong',      color: '#84cc16', width: '80%'},
    {label: 'Very Strong', color: '#4ade80', width: '100%'},
  ];

  const isTooShort = password.length > 0 && password.length < 8;
  const isTooLong  = password.length > 32;
  const current    = levels[score - 1] || {label: 'Too Weak', color: '#ef4444', width: '20%'};

  return (
    <div style={{marginTop: '0.4rem'}}>

      {(isTooShort || isTooLong) && (
        <div style={{
          fontSize: '0.7rem',
          marginBottom: '0.4rem',
          padding: '0.25rem 0.6rem',
          borderRadius: '6px',
          background: isTooLong ? 'rgba(239,68,68,0.12)' : 'rgba(249,115,22,0.12)',
          border: `1px solid ${isTooLong ? '#ef4444' : '#f97316'}`,
          color: isTooLong ? '#ef4444' : '#f97316',
        }}>
          {isTooLong
            ? '⚠ Too long'
            : '⚠ Too short'}
        </div>
      )}

      <div style={{
        height: '4px',
        borderRadius: '999px',
        background: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          borderRadius: '999px',
          width: isTooLong ? '100%' : current.width,
          background: isTooLong ? '#ef4444' : current.color,
          transition: 'width 0.3s ease, background 0.3s ease',
        }}/>
      </div>

      <div style={{
        fontSize: '0.72rem',
        marginTop: '0.25rem',
        color: isTooLong ? '#ef4444' : current.color,
        transition: 'color 0.3s',
      }}>
        {isTooLong
          ? 'Too Long — recommended max 32 characters'
          : current.label}
      </div>

    </div>
  );
};

const LandingPage = ({onEnterShop}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [modal, setModal] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [tAndCModalOpen, setTAndCModalOpen] = useState(false);
  const [pricelistModalOpen, setPricelistModalOpen] = useState(false);
  const [loginFromPricing, setLoginFromPricing] = useState(false);
  const [contactForm, setContactForm] = useState({name: '', email: '', subject: '', message: ''});
  const [contactErrors, setContactErrors] = useState({});
  const [contactSent, setContactSent] = useState(false);
  const [loginErrors, setLoginErrors] = useState({});
  const [errors, setErrors] = useState({});
  const [verificationModal, setVerificationModal] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [passwordHovered, setPasswordHovered] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [hasViewedTnC, setHasViewedTnC] = useState(false);
  const [hoveredService, setHoveredService] = useState(null);
  const [tooltipX, setTooltipX] = useState(0);
  const [tooltipY, setTooltipY] = useState(0);
  
  const [registerForm, setRegisterForm] = useState({
    firstName: '', middleInitial: '', lastName: '',
    address: '', phoneNumber: '', email: '',
    password: '', confirmPassword: '', agreeToTerms: false
  });

  const [loginForm, setLoginForm] = useState({email: '', password: ''});

  const handleContactChange = (field, value) => {
    setContactForm({...contactForm, [field]: value});
    if (contactErrors[field]) {
      setContactErrors({...contactErrors, [field]: ''});
    }
  }

  const handleContactSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!contactForm.name.trim()) newErrors.name = 'Name is required';
    if (!contactForm.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactForm.email))
      newErrors.email = "Please enter a valid email address";
    if (!contactForm.subject.trim()) newErrors.subject = "Subject is required";
    if (!contactForm.message.trim()) newErrors.message = "Message is required";

    setContactErrors(newErrors);
    if (Object.keys(newErrors).length === 0) {
      setContactSent(true);
      setContactForm({name: '', email: '', subject: '', message: ''});
    }
  }

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

  const closeModal = () => {
    setModal(null);
    setHasViewedTnC(false);
  }

  const closeMobile = () => {
    setMobileMenuOpen(false);
    document.body.style.overflow = '';
  };

  const toggleMobile = () => {
    const next = !mobileMenuOpen;
    setMobileMenuOpen(next);
    document.body.style.overflow = next ? 'hidden' : '';
  };

  const handleRegisterChange = (field, value) => {
    if (['firstName', 'lastName'].includes(field)) {
      value = value.replace(/[^a-zA-Z\s]/g, '');
    }

    if (field === 'middleInitial') {
      value = value.replace(/[^a-zA-Z]/g, '').toUpperCase();
    }

    setRegisterForm({...registerForm, [field]: value}); 
    if (errors[field]) {
      setErrors({...errors, [field]: ''});
    }
  };

  const validateField = (field, value) => {
    switch(field) {
      case 'firstName':
        if (!value.trim()) return 'First name is required';
        if (!/^[a-zA-Z\s]+$/.test(value)) return 'First name can only contain letters';
        if (value.trim().length < 2) return 'First name must be at least 2 characters';
        return '';
      
      case 'middleInitial':
        if (value && !/^[A-Z]{1,2}$/.test(value)) return 'Middle initial must be 1-2 uppercase letters';
        return '';
      
      case 'lastName':
        if (!value.trim()) return 'Last name is required';
        if (!/^[a-zA-Z\s]+$/.test(value)) return 'Last name can only contain letters';
        if (value.trim().length < 2) return 'Last name must be at least 2 characters';
        return '';
      
      case 'address':
        if (!value.trim()) return 'Address is required';
        if (value.trim().length < 10) return 'Address must be at least 10 characters';
        return '';
      
      case 'phoneNumber':
        if (!value.trim()) return 'Phone number is required';
        const phoneRegex = /^(\+63|0)\d{10}$/;
        if (!phoneRegex.test(value.replace(/\s/g, ''))) return 'Please enter a valid Philippine phone number';
        return '';
      
      case 'email':
        if (!value.trim()) return 'Email is required';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) return 'Please enter a valid email address';
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
      
      default:
        return '';
    }
  };

  const isFormFilled = () => {
    return (
      registerForm.firstName.trim() !== '' &&
      registerForm.lastName.trim() !== '' &&
      registerForm.address.trim() !== '' &&
      registerForm.phoneNumber.trim() !== '' &&
      registerForm.email.trim() !== '' &&
      registerForm.password !== '' &&
      registerForm.confirmPassword !== '' &&
      registerForm.agreeToTerms === true
    );
  };

  const validateForm = () => {
    const newErrors = {};
    const fields = ['firstName', 'middleInitial', 'lastName', 'address', 'phoneNumber', 'email', 'password', 'confirmPassword', 'agreeToTerms'];

    fields.forEach(field => {
      const error = validateField(field, registerForm[field]);
      if (error) newErrors[field] = error;
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setIsRegistering(true);

    try {
      const response = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          firstName: registerForm.firstName.trim(),
          middleInitial: registerForm.middleInitial.trim(),
          lastName: registerForm.lastName.trim(),
          address: registerForm.address.trim(),
          phoneNumber: registerForm.phoneNumber.trim(),
          email: registerForm.email.trim(),
          password: registerForm.password,
          password_confirmation: registerForm.confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.errors) {
          const serverErrors = {};
          Object.keys(data.errors).forEach(key => {
            serverErrors[key] = data.errors[key][0];
          });
          setErrors(serverErrors);
        } else {
          setErrors({email: data.error || data.message || 'Registration failed. Please try again.'});
        }
        return;
      }

      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
      setRegisteredEmail(registerForm.email);
      setModal(null);
      setRegisterForm({
        firstName: '', middleInitial: '', lastName: '',
        address: '', phoneNumber: '', email: '',
        password: '', confirmPassword: '', agreeToTerms: false
      });
      setErrors({});
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
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginForm.email)) newErrors.email = 'Please enter valid email';

    if (!loginForm.password) newErrors.password = 'Password is required';
    setLoginErrors(newErrors);

    if (Object.keys(newErrors).length > 0) return;

    setIsLoggingIn(true);

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          email: loginForm.email,
          password: loginForm.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setLoginErrors({password: data.message || 'Invalid email or password.'});
        return;
      }

      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem('auth_token', data.token);
      storage.setItem('auth_user', JSON.stringify(data.user));

      if (data.user.role === 'admin') {
        window.location.href = '/dashboard/business';
        return;
      }

      if (loginFromPricing) {
        setPricelistModalOpen(true);
        setLoginFromPricing(false);
      }

      closeModal();
      setLoginForm({email: '', password: ''});
    } catch (err) {
      setLoginErrors({password: 'Network error. Make sure the backend server is running'});
    } finally {
      setIsLoggingIn(false);
    }
  };

const services = [
  { img: '/products/Tshit_printing.jpg', title: 'T-Shirt Printing',
    desc: 'Silkscreen & DTF printing available. Starts at ₱300. Final cost depends on quantity, design complexity, material type, and panel print. Perfect for teams, events, and merchandise.' },
  { img: '/products/DTF.jpg', title: 'DTF Printing',
    desc: 'Direct-to-Film printing. Starts at ₱250 per meter. Vivid, full-color prints on fabric. Final cost depends on quantity. Great for custom apparel and fabric items.' },
  { img: '/products/mugs.jpg', title: 'Mugs (11oz)',
    desc: 'Three variants: Ceramic White, Inner Color Mug, and Magic Mug. Starting at ₱50/pc for 501–1000 pcs. Sublimation-printed for lasting, vibrant color.' },
  { img: '/products/ButtonPins.jpg', title: 'Button Pins & Badges',
    desc: 'Available as Badge/Button Pin, Magnet Badge, and Keychain Badge (2.25"). Starting at ₱10/pc for 501–1000 pcs. Ideal for promotions, events, and giveaways.' },
  { img: '/products/ecobags.jpg', title: 'Canvas Totebag',
    desc: 'Plain and w/ Zipper & Pocket variants. Sizes: Small (10x12"), Medium (12x14"), Large (14x16"). Starting at ₱70/pc for bulk orders. Eco-friendly and customizable.' },
  { img: '/products/MousePad.jpg', title: 'Mousepad',
    desc: 'Rectangle 22x18cm sublimation-printed mousepad. Starting at ₱70/pc for 501–1000 pcs. Full-color custom design on a smooth, non-slip surface.' },
  { img: '/products/RefMagnet.jpg', title: 'Ref Magnet',
    desc: 'Custom refrigerator magnets up to 3" max size. Starting at ₱15/pc for 501–1000 pcs. Popular souvenir and giveaway item for events and occasions.' },
  { img: '/products/Souvenirs.jpg', title: 'Souvenirs & Gift Items',
    desc: 'Custom souvenir items for weddings, birthdays, debuts, and corporate events. Wide variety of personalized items available.' },
  { img: '/products/Stickers.jpg', title: 'Stickers & Labels',
    desc: 'Kisscut & Diecut. Variants: Vinyl Waterproof, Laminated, Specialty Label, Photopaper, Regular, and Kraft. Priced per A4 sheet. Starting at ₱25.' },
  { img: '/products/Bookmarks.jpg', title: 'Magnetic Bookmark',
    desc: 'Maximum size 2.5". Starting at ₱15/pc for 501–1000 pcs. Custom-printed magnetic bookmarks — perfect gifts and giveaways for readers and events.' },
  { img: '/products/Ballpens.jpg', title: 'Ballpens',
    desc: 'Custom printed ballpens — affordable and practical promotional item. Ideal for corporate giveaways, school events, and bulk orders.' },
  { img: '/products/Caps.jpg', title: 'Caps',
    desc: 'Custom printed or embroidered caps. Perfect for teams, sports events, corporate uniforms, and merchandise. Contact us for bulk pricing.' },
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
    {
      category: 'Mugs (11oz)', note: null,
      variants: [
        { name: 'Ceramic White',   tiers: [['1-20 pcs','95'],['21-30 pcs','90'],['31-50 pcs','85'],['51-100 pcs','80'],['101-300 pcs','70'],['301-500 pcs','60'],['501-1000 pcs','50']] },
        { name: 'Inner Color Mug', tiers: [['1-20 pcs','100'],['21-30 pcs','95'],['31-50 pcs','90'],['51-100 pcs','85'],['101-300 pcs','75'],['301-500 pcs','65'],['501-1000 pcs','55']] },
        { name: 'Magic Mug',       tiers: [['1-20 pcs','200'],['21-30 pcs','180'],['31-50 pcs','170'],['51-100 pcs','160'],['101-300 pcs','150'],['301-500 pcs','130'],['501-1000 pcs','100']] },
      ],
    },
    {
      category: 'Button Badges (2.25")', note: null,
      variants: [
        { name: 'Badge/Button Pin', tiers: [['1-20 pcs','30'],['21-30 pcs','28'],['31-50 pcs','25'],['51-100 pcs','20'],['101-300 pcs','18'],['301-500 pcs','15'],['501-1000 pcs','10']] },
        { name: 'Magnet Badge',     tiers: [['1-20 pcs','30'],['21-30 pcs','28'],['31-50 pcs','25'],['51-100 pcs','23'],['101-300 pcs','20'],['301-500 pcs','18'],['501-1000 pcs','15']] },
        { name: 'Keychain Badge',   tiers: [['1-20 pcs','33'],['21-30 pcs','30'],['31-50 pcs','28'],['51-100 pcs','25'],['101-300 pcs','23'],['301-500 pcs','20'],['501-1000 pcs','18']] },
      ],
    },
    {
      category: 'Canvas Totebag', note: null,
      variants: [
        { name: 'Plain Small (10x12")',              tiers: [['1-20 pcs','100'],['21-30 pcs','95'],['31-50 pcs','90'],['51-100 pcs','85'],['101-300 pcs','80'],['301-500 pcs','75'],['501-1000 pcs','70']] },
        { name: 'Plain Medium (12x14")',             tiers: [['1-20 pcs','110'],['21-30 pcs','100'],['31-50 pcs','95'],['51-100 pcs','90'],['101-300 pcs','85'],['301-500 pcs','80'],['501-1000 pcs','75']] },
        { name: 'Plain Large (14x16")',              tiers: [['1-20 pcs','120'],['21-30 pcs','110'],['31-50 pcs','105'],['51-100 pcs','100'],['101-300 pcs','95'],['301-500 pcs','90'],['501-1000 pcs','85']] },
        { name: 'w/ Zipper & Pocket Small (10x12")',  tiers: [['1-20 pcs','130'],['21-30 pcs','120'],['31-50 pcs','115'],['51-100 pcs','110'],['101-300 pcs','105'],['301-500 pcs','95'],['501-1000 pcs','90']] },
        { name: 'w/ Zipper & Pocket Medium (12x14")', tiers: [['1-20 pcs','140'],['21-30 pcs','130'],['31-50 pcs','125'],['51-100 pcs','120'],['101-300 pcs','115'],['301-500 pcs','110'],['501-1000 pcs','105']] },
        { name: 'w/ Zipper & Pocket Large (14x16")',  tiers: [['1-20 pcs','150'],['21-30 pcs','140'],['31-50 pcs','135'],['51-100 pcs','130'],['101-300 pcs','125'],['301-500 pcs','120'],['501-1000 pcs','115']] },
      ],
    },
    { category: 'Ref Magnet (Max 3")',           note: null, tiers: [['1-20 pcs','30'],['21-30 pcs','28'],['31-50 pcs','25'],['51-100 pcs','23'],['101-300 pcs','20'],['301-500 pcs','18'],['501-1000 pcs','15']] },
    { category: 'Magnetic Bookmark (Max 2.5")',  note: null, tiers: [['1-20 pcs','30'],['21-30 pcs','28'],['31-50 pcs','25'],['51-100 pcs','23'],['101-300 pcs','20'],['301-500 pcs','18'],['501-1000 pcs','15']] },
    {
      category: 'Stickers & Labels (Kisscut / Diecut)',
      note: 'Price is per A4 size, depending on how many pieces fit on one A4 sheet.',
      variants: [
        { name: 'Vinyl Waterproof (Glossy/Matte/Transparent)',                          tiers: [['1-30 pcs','50'],['31-50 pcs','45'],['51-100 pcs','43'],['101-300 pcs','40'],['301-500 pcs','38'],['501-1000 pcs','35']] },
        { name: 'Vinyl Waterproof Laminated (Glossy/Matte/Glittered/Holographic)',      tiers: [['1-30 pcs','55'],['31-50 pcs','50'],['51-100 pcs','48'],['101-300 pcs','45'],['301-500 pcs','43'],['501-1000 pcs','40']] },
        { name: 'Specialty Label Waterproof (Pearl Glossy/Aluminum/Gold/Holographic)',  tiers: [['1-30 pcs','65'],['31-50 pcs','60'],['51-100 pcs','58'],['101-300 pcs','55'],['301-500 pcs','53'],['501-1000 pcs','50']] },
        { name: 'Photopaper Waterproof (Glossy/Matte)',                                 tiers: [['1-30 pcs','45'],['31-50 pcs','40'],['51-100 pcs','38'],['101-300 pcs','35'],['301-500 pcs','33'],['501-1000 pcs','30']] },
        { name: 'Regular Sticker Paper Non-Waterproof (Glossy/Matte)',                  tiers: [['1-30 pcs','40'],['31-50 pcs','38'],['51-100 pcs','35'],['101-300 pcs','33'],['301-500 pcs','30'],['501-1000 pcs','28']] },
        { name: 'Kraft Sticker Paper (Glossy/Matte/Transparent)',                       tiers: [['1-30 pcs','35'],['31-50 pcs','33'],['51-100 pcs','30'],['101-300 pcs','28'],['301-500 pcs','27'],['501-1000 pcs','25']] },
      ],
    },
  ];

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
            <h2 className="section-title">Our <span className="gold-text">Print</span> Services</h2>
            <p className="section-subtitle">
              From apparel to promotional materials — we bring your ideas to life
              with precision printing at prices that won't break the bank.
            </p>
          </div>
        </div>

      <div style={{position: 'relative'}}>
        {hoveredService !== null && (
          <div style={{
            position: 'fixed',
            top: tooltipY - 8,
            left: tooltipX,
            transform: 'translate(-50%, -100%)',
            width: '240px',
            background: 'linear-gradient(135deg, #1a1a1a 0%, #111 100%)',
            border: '1px solid var(--gold, #d4a843)',
            borderRadius: '14px',
            padding: '1rem 1.25rem',
            zIndex: 9999,
            boxShadow: '0 12px 40px rgba(0,0,0,0.85), 0 0 0 1px rgba(212,168,67,0.15)',
            fontSize: '0.82rem',
            color: 'rgba(255,255,255,0.75)',
            lineHeight: '1.65',
            pointerEvents: 'none',
            textAlign: 'left',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: '10%', right: '10%', height: '2px',
              background: 'linear-gradient(90deg, transparent, var(--gold, #d4a843), transparent)',
              borderRadius: '999px',
            }}/>
            <div style={{
              position: 'absolute', bottom: '-7px', left: '50%',
              transform: 'translateX(-50%)',
              width: '12px', height: '7px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: '10px', height: '10px',
                background: '#1a1a1a',
                border: '1px solid var(--gold, #d4a843)',
                transform: 'rotate(45deg)',
                marginTop: '-5px',
                marginLeft: '1px',
              }}/>
            </div>
            <strong style={{
              color: 'var(--gold, #d4a843)',
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.9rem',
              fontWeight: '700',
              letterSpacing: '0.02em',
            }}>
              {services[hoveredService % services.length]?.title}
            </strong>
            {services[hoveredService % services.length]?.desc}
          </div>
        )}    

      <div className="services-carousel-wrapper">
        <div className="services-carousel-track">
          {[...services, ...services].map((s, i) => (
            <div className="service-slide" key={i}
              onMouseEnter={(e) => {
                setHoveredService(i);
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltipX(rect.left + rect.width / 2);
                setTooltipY(rect.top - 10);
              }}
              onMouseLeave={() => setHoveredService(null)}
            >
              <div className="service-slide-img-wrap">
                <img src={s.img} alt={s.title} className="service-slide-img"/>
              </div>
              <h3>{s.title}</h3>
            </div>
          ))}
        </div>
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
      <section id="why-us" className="why-us">
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

      { /* PRICING */ }
      <section id="pricing" className="pricing-bg">
        <div className="container">
          <div className="section-header center">
            <span className="section-tag">Transparent Pricing</span>
            <h2 className="section-title">Our <span className="gold-text">Price</span> List</h2>
            <p className="section-subtitle">
              Starting prices for all our products. Login or Register to view the complete pricelist with bulk pricing breakdowns.
            </p>
          </div>

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

          <div className="pricing-unlock-banner fade-up" style={{
            background: 'linear-gradient(135deg, rgba(212,168,67,0.08) 0%, rgba(196,30,58,0.08) 100%)',
            border: '1px solid rgba(212,168,67,0.25)',
            borderRadius: '16px',
            padding: '2.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '2rem',
            flexWrap: 'wrap',
          }}>
            <div style={{display: 'flex', alignItems: 'center', gap: '1.5rem'}}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '14px', flexShrink: 0,
                background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <div>
                <h3 style={{margin: '0 0 0.35rem', fontSize: '1.2rem', color: 'var(--white)'}}>
                  View the Complete Pricelist
                </h3>
                <p style={{margin: 0, color: 'var(--gray)', fontSize: '0.9rem', maxWidth: '480px', lineHeight: '1.6'}}>
                  Create a free account or log in to access full bulk pricing breakdowns for all our products and services.
                </p>
              </div>
            </div>
            <div style={{display: 'flex', gap: '0.75rem', flexWrap: 'wrap'}}>
              <button className="btn-primary" onClick={() => {setLoginFromPricing(true); openModal('login');}}>
                Login to View
              </button>
              <button className="btn-secondary" onClick={() => {setLoginFromPricing(true); openModal('register');}}>
                Register Free
              </button>
            </div>
          </div>
        </div>
      </section>

      { /* CONTACT */ }
      <section id="contact" className="contact-bg">
        <div className="container">
          <div className="section-header center">
            <div className="section-tag">Get In Touch</div>
            <h2 className="section-title">Let's <span className="red-text">Talk</span></h2>
            <p className="section-subtitle">
              Have a question, a bulk order, or a custom request? We'd love to hear from you.
              Reach out and we'll get back to you as soon as possible.
            </p>
          </div>
          <div className="contact-layout">
            <div className="contact-info fade-up">
              <div className="contact-info-card">
                <div className="contact-info-icon">📍</div>
                <div>
                  <h4>Visit Us</h4>
                  <p>5 Ford St., Fil.2, Batasan Hills, Quezon City</p>
                </div>
              </div>
            <div className="contact-info-card">
              <div className="contact-info-icon">📱</div>
              <div>
                <h4>Message Us</h4>
                <p>Facebook, Instagram, TikTok</p>
                <p style={{fontSize: '.78rem', color: 'var(--gray)', marginTop: '.2rem'}}>@personalizemeprints</p>
              </div>
            </div>
            <div className="contact-info-card">
              <div className="contact-info-icon">🕐</div>
              <div>
                <h4>Business Hours</h4>
                <p>Mon - Sat: 9:00 AM - 6:00 PM</p>
                <p style={{fontSize: '.78rem', color: 'var(--gray)', marginTop: '.2rem'}}>Sunday: By Appointment</p>
              </div>
            </div>
            <div className="contact-info-card">
              <div className="contact-info-icon">🛍️</div>
              <div>
                <h4>Shop Online</h4>
                <a href="https://shopee.ph/personalizemeprints" target="_blank" rel="noopener noreferrer" className="auth-link">
                  Shopee: personlizemeprints
                </a>
              </div>
            </div>
            
            <div className="contact-socials">
              <a href="https://www.facebook.com/share/1Mks4kwnhZ/?mibextid=wwXIfr" className="contact-social-btn" target="_blank" rel="noopener noreferrer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                </svg>
                Facebook
              </a>

              <a href="https://www.instagram.com/personalizemeprints" className="contact-social-btn" target="_blank" rel="noopener noreferrer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
                </svg>
                Instagram
              </a>

              <a href="https://www.tiktok.com/persolizemeprints" className="contact-social-btn" target="_blank" rel="noopener noreferrer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/>
                </svg>
                TikTok
              </a>
            </div>
          </div>

          <div className="contact-form-wrap fade-up">
            {contactSent ? (
              <div className="contact-success">
                <div className="contact-success-icon">✅</div>
                <h3>Message Sent!</h3>
                <p>Thanks for reaching out! We'll get back to you within 24 hours.</p>
              </div>
            ) : (
              <form className="contact-form" onSubmit={handleContactSubmit}>
                <div className="contact-fields-row">
                  <div className="auth-field">
                    <label>Your Name</label>
                    <input type="text" placeholder="Juan Dela Cruz" value={contactForm.name} onChange={(e) => handleContactChange('name', e.target.value)} className={contactErrors.name ? 'error' : ''}/>
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
                  <input type="text" placeholder="Bulk order inquery, custom design, etc." value={contactForm.subject} onChange={(e) => handleContactChange('subject', e.target.value)} className={contactErrors.subject ? 'error' : ''}/>
                  {contactErrors.subject && <span className="error-message">{contactErrors.subject}</span>}
                </div>
                <div className="auth-field">
                  <label>Message</label>

                  <textarea placeholder="Tell us about your order, design, ideas, or any questions you have..." value={contactForm.message} onChange={(e) => handleContactChange('message', e.target.value)} className={`contact-textarea ${contactErrors.message ? 'error' : ''}`} rows={5}/>
                  {contactErrors.message && <span className="error-message">{contactErrors.message}</span>}
                </div>
                <button type="submit" className="btn-primary contact-submit-btn">
                  Send Message
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/> 
                    </svg>
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
              <button className="btn-primary" onClick={onEnterShop}>
                Browse Products
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>  
                </svg> 
              </button>
              <a href="#services" className="btn-secondary">View Services</a> 
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container">
          <div className="footer-bottom" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem'}}>
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
              <a href="#pricing">Pricing</a>
              <a href="#contact">Contact</a>
            </nav>
            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem'}}>
              <div className="footer-legal">
                <a href="#">Privacy Policy</a>
                <a href="#">Terms of Service</a>
              </div>
              <p style={{fontSize: '0.75rem', color: 'var(--gray)', margin: 0}}>© 2024 Personalize ME Prints. All rights reserved.</p>
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
            <form onSubmit={handleLoginSubmit}>
              <div className="auth-field">
                <label>Email Address</label>
                <input type="email" placeholder="you@example.com" value={loginForm.email} onChange={(e) => setLoginForm({...loginForm, email: e.target.value})} className={loginErrors.email ? 'error' : ''}/>
                {loginErrors.email && <span className="error-message">{loginErrors.email}</span>}
              </div>

              <div className="auth-field">
                <label>Password</label>
                <div className="auth-input-wrap">
                  <input type={showPassword ? 'text' : 'password'} placeholder="Enter your password" onChange={(e) => setLoginForm({...loginForm, password: e.target.value})} className={loginErrors.password ? 'error' : ''}/>
                  <button type="button" className="auth-eye" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
                          </svg>
                      ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75C21.27 7.61 17 4.5 12 4.5c-1.23 0-2.41.2-3.51.57l2.17 2.17C11.13 7.09 11.56 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 0 1-5-5c0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                          </svg>
                      )}
                  </button>
                </div>
                {errors.password && <span className="error-message">{errors.password}</span>}
              </div>

              <div className="auth-row">
                <label className="auth-check"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}/><span>Remember Me</span></label>
                <a href="#" className="auth-link">Forgot Password</a>
              </div>

              <button type="submit" className="btn-auth-submit" disabled={isLoggingIn}>{isLoggingIn ? 'Signing In...' : 'Sign In'}</button>
            </form>

            <p className="auth-switch">Don't have an account?<button type="button" onClick={() => setModal('register')}>Create one</button></p>
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
            <form onSubmit={handleRegisterSubmit} autoComplete="off">
              <div className="auth-fields-grid">
                <div className="auth-field">
                  <label>First Name</label>
                  <input 
                    type="text" 
                    placeholder="Juan" 
                    value={registerForm.firstName}
                    onChange={(e) => handleRegisterChange('firstName', e.target.value)}
                    onBlur={(e) => handleRegisterChange('firstName', e.target.value.trim())}
                    className={errors.firstName ? 'error' : ''}
                  />
                  {errors.firstName && <span className="error-message">{errors.firstName}</span>}
                </div>
                <div className="auth-field">
                  <label>Middle Initial</label>
                  <input 
                    type="text" 
                    placeholder="D." 
                    value={registerForm.middleInitial}
                    onChange={(e) => handleRegisterChange('middleInitial', e.target.value.toUpperCase())}
                    maxLength="2"
                    className={errors.middleInitial ? 'error' : ''}
                  />
                  {errors.middleInitial && <span className="error-message">{errors.middleInitial}</span>}
                </div>
                <div className="auth-field">
                  <label>Last Name</label>
                  <input 
                    type="text" 
                    placeholder="Dela Cruz" 
                    value={registerForm.lastName}
                    onChange={(e) => handleRegisterChange('lastName', e.target.value)}
                    onBlur={(e) => handleRegisterChange('lastName', e.target.value.trim())}
                    className={errors.lastName ? 'error' : ''}
                  />
                  {errors.lastName && <span className="error-message">{errors.lastName}</span>}
                </div>
              </div>
              
              <div className="auth-field">
                <label>Address</label>
                <input 
                  type="text" 
                  placeholder="123 Main Street, City, Province, ZIP Code" 
                  value={registerForm.address}
                  onChange={(e) => handleRegisterChange('address', e.target.value)}
                  className={errors.address ? 'error' : ''}
                />
                {errors.address && <span className="error-message">{errors.address}</span>}
              </div>
              
              <div className="auth-field">
                <label>Phone Number</label>
                <div style={{display: 'flex', gap: '0', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)'}}>
                  <div style={{
                    background: 'var(--dark3, #1a1a1a)',
                    borderRight: '1px solid var(--border)',
                    padding: '0 1rem',
                    display: 'flex', alignItems: 'center',
                    color: 'var(--white)', fontWeight: '700',
                    fontSize: '0.95rem', flexShrink: 0,
                    userSelect: 'none',
                  }}>
                    +63
                  </div>
                  <input 
                    type="tel"
                    placeholder="912 345 6789"
                    value={registerForm.phoneNumber.replace(/^\+63/, '')}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                      handleRegisterChange('phoneNumber', '+63' + digits);
                    }}
                    className={errors.phoneNumber ? 'error' : ''}
                    maxLength={10}
                    style={{
                      border: 'none', borderRadius: '0', flex: '1', background: 'transparent',
                    }}/>
                </div>
                {errors.phoneNumber && <span className="error-message">{errors.phoneNumber}</span>}
              </div>
              
              <div className="auth-field">
                <label>Email Address</label>
                <input 
                  type="email" 
                  placeholder="you@example.com" 
                  value={registerForm.email}
                  onChange={(e) => handleRegisterChange('email', e.target.value)}
                  className={errors.email ? 'error' : ''}
                />
                {errors.email && <span className="error-message">{errors.email}</span>}
              </div>
              
              <div className="auth-fields-grid">
                <div className="auth-field" style={{position: 'relative'}}>
                  <label>Password</label>
                  <div className="auth-input-wrap">
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      placeholder="Create Password" 
                      autoComplete="new-password"
                      maxLength={64}
                      value={registerForm.password}
                      onChange={(e) => handleRegisterChange('password', e.target.value)}
                      onMouseEnter={() => setPasswordHovered(true)}
                      onMouseLeave={() => setPasswordHovered(false)}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                      className={errors.password ? 'error' : ''}
                    />
                    <button type="button" className="auth-eye" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
                          </svg>
                      ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75C21.27 7.61 17 4.5 12 4.5c-1.23 0-2.41.2-3.51.57l2.17 2.17C11.13 7.09 11.56 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 0 1-5-5c0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                          </svg>
                      )}
                    </button>
                  </div>

                  {(passwordHovered || passwordFocused) && (
                    <div style={{
                      position: 'absolute',
                      top: '0',
                      left: 'calc(100% + 10px)',
                      width: '180px',
                      background:'var(--dark2, #1a1a1a)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '0.75rem',
                      zIndex: 100,
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                    }}>
                      <div style={{
                        position: 'absolute',
                        left: '-6px', top: '16px',
                        width: '10px', height: '10px',
                        background: 'var(--dark2, #1a1a1a)',
                        border: '1px solid var(--border)',
                        borderRight: 'none', borderTop: 'none',
                        transform: 'rotate(45deg)',
                      }}/>

                      {passwordFocused && registerForm.password.length > 0
                       ? <PasswordStrength password={registerForm.password}/>
                       : (
                        <div style={{display: 'flex', flexDirection: 'column', gap: '0.4rem'}}>
                          {[
                            { label: 'Password must be at least 8 characters',     pass: registerForm.password.length >= 8 },
                            { label: 'Must contain at least one uppercase letter',    pass: /[A-Z]/.test(registerForm.password) },
                            { label: 'Must contain at least one lowercase letter',    pass: /[a-z]/.test(registerForm.password) },
                            { label: 'Must contain at least one number',       pass: /\d/.test(registerForm.password) },
                            { label: 'Must contain at least one special character', pass: /[!@#$%^&*(),.?":{}|<>]/.test(registerForm.password) },
                          ].map((c, i) => (
                            <div key={i} style={{
                              display: 'flex', alignItems: 'center', gap: '0.4rem',
                              fontSize: ' 0.72rem', 
                              color: c.pass ? '#4ade80' : 'var(--gray)',
                              transition: 'color 0.2s',
                            }}>
                              <span style={{fontSize: '0.65rem'}}>{c.pass ? '✓' : '·'}</span>
                              {c.label}
                            </div>
                          ))}
                        </div>
                       )}
                    </div>
                  )}
                  {errors.password && <span className="error-message">{errors.password}</span>}
                </div>
                <div className="auth-field">
                  <label>Confirm Password</label>
                  <div className="auth-input-wrap">
                    <input 
                      type={showConfirm ? 'text' : 'password'} 
                      placeholder="Repeat Password" 
                      autoComplete="new-password"
                      value={registerForm.confirmPassword}
                      onChange={(e) => handleRegisterChange('confirmPassword', e.target.value)}
                      className={errors.confirmPassword ? 'error' : ''}
                    />
                    <button type="button" className="auth-eye" onClick={() => setShowConfirm(!showConfirm)}>
                      {showConfirm ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75C21.27 7.61 17 4.5 12 4.5c-1.23 0-2.41.2-3.51.57l2.17 2.17C11.13 7.09 11.56 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 0 1-5-5c0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                            </svg>
                        )}
                    </button>
                  </div>
                  {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
                </div>
              </div>
              
              <div className="auth-field">
                <label className="auth-check auth-terms">
                  <input
                    type="checkbox"
                    checked={registerForm.agreeToTerms}
                    disabled={true}
                    readOnly
                    style={{ opacity: registerForm.agreeToTerms ? 1 : 0.4, cursor: 'not-allowed' }}
                  />
                  <span style={{ color: registerForm.agreeToTerms ? 'inherit' : 'var(--gray)' }}>
                    {registerForm.agreeToTerms
                      ? <span style={{ color: '#4ade80' }}>✓ You have agreed to the </span>
                      : 'Please read and agree to the '}
                    <button type="button" className="auth-link tnc-trigger" onClick={() => setTAndCModalOpen(true)}>
                      Terms and Conditions
                    </button>
                    {' '}and <a href="#" className="auth-link">Privacy Policy</a>
                  </span>
                </label>
                {errors.agreeToTerms && <span className="error-message">{errors.agreeToTerms}</span>}
              </div>
              
              <button type="submit" className="btn-auth-submit" disabled={!isFormFilled() || isRegistering}>{isRegistering ? 'Creating Account...' : 'Create Account'}</button>
            </form>
            
            <p className="auth-switch">Already have an account? <button onClick={() => setModal('login')}>Sign In</button></p>
          </div>
        </>
      )}
      </div>
    </div>
  )}

      {/* TERMS AND CONDITIONS MODAL */}
      {tAndCModalOpen && (
        <div className="tnc-overlay" onClick={() => setTAndCModalOpen(false)}>
          <div className="tnc-modal" onClick={e => e.stopPropagation()}>
            <div className="tnc-header">
              <h3>Terms and Conditions</h3>
              <button className="tnc-close" onClick={() => setTAndCModalOpen(false)}>✕</button>
            </div>
            <div className="tnc-content">
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

              <div style={{
                marginTop: '2rem',
                paddingTop: '1.25rem',
                borderTop: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: '0.75rem',
              }}>
                <input
                  type="checkbox"
                  id="tnc-agree-inside"
                  checked={registerForm.agreeToTerms}
                  onChange={(e) => {
                    handleRegisterChange('agreeToTerms', e.target.checked);
                    if (e.target.checked) setTAndCModalOpen(false);
                  }}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--gold)', flexShrink: 0 }}
                />
                <label htmlFor="tnc-agree-inside" style={{
                  fontSize: '0.88rem', color: 'var(--white)',
                  cursor: 'pointer', userSelect: 'none',
                }}>
                  I have read and agree to the Terms and Conditions
                </label>
              </div>
            </div>

            <div className="tnc-actions">
              <button className="btn-secondary" onClick={() => setTAndCModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

  { /* PRICELIST MODAL */ }
  {pricelistModalOpen && (
    <div className="auth-overlay" onClick={() => setPricelistModalOpen(false)}>
      <div className="pricelist-modal" onClick={e => e.stopPropagation()}>
        <div className="pricelist-modal-header">
          <div>
            <h2>Complete Pricelist</h2>
            <p>All products with full bulk pricing</p>
          </div>
          <button className="auth-close" onClick={() => setPricelistModalOpen(false)}>x</button>
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
                      <span className="pl-qty">{qty}</span>
                      <span className="pl-dash">—</span>
                      <span className="pl-price gold-text">₱{price}</span>
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
                            <span className="pl-qty">{qty}</span>
                            <span className="pl-dash">—</span>
                            <span className="pl-price gold-text">₱{price}</span>
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

  { /* EMAIL VERIFICATION */ }
  {verificationModal && (
    <div className="auth-overlay" onClick={() => setVerificationModal(false)}>
      <div className="verify-modal" onClick={e => e.stopPropagation()}>
        <div className="verify-icon-wrap">
          <div className="verify-icon">✉️</div>
          <div className="verify-pulse"></div>
        </div>
        <h2 className="verify-title">Verify Your Email</h2>
        <p className="verify-subtitle">Enter the 6-digit code</p>
        <div className="verify-email-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          {registeredEmail} 
        </div>
        <div className="verify-code-wrap">
          <input type="text" className="verify-code-input" placeholder="Enter 6-digit code" maxLength={6} value={verificationCode} onChange={e => setVerificationCode(e.target.value.replace(/\D/g, ''))}/>
          {verifyError && <span className="error-message">{verifyError}</span>}
        </div>
        <div className="verify-steps">
          <div className="verify-step">
            <div className="verify-step-num">1</div>
            <span>Check your inbox (and spam folder)</span>
          </div>
          <div className="verify-step">
            <div className="verify-step-num">2</div>
            <span>Enter the 6-digit code</span>
          </div>
          <div className="verify-step">
            <div className="verify-step-num">3</div>
            <span>Click to verify to activate your account</span>
          </div>
        </div>
        <div className="verify-actions">
          <button className="btn-primary verify-login-btn" onClick={async () => {
            if (verificationCode.length !== 6) {
              setVerifyError('Please enter the 6-digit code');
              return;
            }

            setVerifyError('');
            try {
              const response = await fetch(`${API_URL}/api/verify`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                  email: registeredEmail,
                  code: verificationCode,
                }),
              });

              const data = await response.json();
              if (!response.ok) {
                setVerifyError(data.message || 'Verification failed.');
                return;
              }

              setVerificationModal(false);
              setVerificationCode('');
              openModal('login');
            } catch (err) {
                setVerifyError('Network error. Make sure backend is running.');
            }
          }}>
            Verify & Login
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="btn-secondary" onClick={() => setVerificationModal(false)}>
            Close
          </button>
        </div>
        <p className="verify-send">
          Didn't receive the code?{' '}
          <button className="auth-link" onClick={async () => {
            try {
              const response = await fetch(`${API_URL}/api/resend-code`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({email: registeredEmail}),
              });

              const data = await response.json();
              if (!response.ok) {
                setVerifyError(data.message || 'Failed to resend code.');
                return;
              }

              setVerifyError('');
              setVerificationCode('');
              alert('A new verification code has been sent to your email!');
            } catch (err) {
                setVerifyError('Network error. Make sure backend is running.');
            }
          }}>Resend Code</button>
        </p>
      </div>
    </div>
  )}
    </>
  );
};

export default LandingPage;