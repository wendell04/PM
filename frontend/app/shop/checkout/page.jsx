'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/context/CartContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import '@/app/shop/shop.css';
import { applyVoucher } from '@/lib/voucherApi';
import { useTheme } from '@/contexts/ThemeContext';
import { DEFAULT_CUSTOM_ORDER_TERMS } from '@/lib/customOrderTerms';

const AddressBook = dynamic(() => import('@/components/profile/AddressBook'), { ssr: false });

const METRO_CITIES = ['Manila', 'Quezon City', 'Caloocan', 'Las Piñas', 'Makati', 'Malabon', 'Mandaluyong', 'Marikina', 'Muntinlupa', 'Navotas', 'Parañaque', 'Pasay', 'Pasig', 'Pateros', 'San Juan', 'Taguig', 'Valenzuela'];
function isMetroManila(city, province) {
  const p = (province || '').toLowerCase();
  const c = (city || '').toLowerCase();
  return p.includes('metro manila') || p.includes('ncr') || p.includes('national capital')
    || METRO_CITIES.some(m => c.includes(m.toLowerCase()));
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function VisaLogo({ width = 38, height = 24 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="#1A1F71"/>
      <text
        x="19" y="17"
        textAnchor="middle"
        fill="white"
        fontSize="11"
        fontWeight="bold"
        fontStyle="italic"
        fontFamily="Arial, Helvetica, sans-serif"
        letterSpacing="0.5"
      >
        VISA
      </text>
    </svg>
  );
}

function MastercardLogo({ width = 38, height = 24 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="#252525"/>
      <circle cx="14" cy="12" r="7.5" fill="#EB001B"/>
      <circle cx="24" cy="12" r="7.5" fill="#F79E1B"/>
      <path d="M19 6.41 A7.5 7.5 0 0 1 19 17.59 A7.5 7.5 0 0 1 19 6.41 Z" fill="#FF5F00"/>
    </svg>
  );
}

function CardLogosBig() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <VisaLogo width={38} height={24} />
      <MastercardLogo width={38} height={24} />
    </div>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const { token, currentUser } = useAuth();
  const { theme } = useTheme();
  const { clearCart } = useCart();

  // Cart payload (loaded from sessionStorage)
  const [items, setItems] = useState([]);

  // Address
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [showAddressPicker, setShowAddressPicker] = useState(false);

  // UI state
  const [addressLoading, setAddressLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [fromCart, setFromCart] = useState(false);
  const [error, setError] = useState(null);
  const [payloadError, setPayloadError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [designFile, setDesignFile] = useState(null);
  const [designNotes, setDesignNotes] = useState('');
  const [designPreviewUrl, setDesignPreviewUrl] = useState(null);
  const [designFilePreviewUrl, setDesignFilePreviewUrl] = useState(null);
  const [paymentMethod,    setPaymentMethod]    = useState('cod');
  const [eWalletPhone,     setEWalletPhone]     = useState('');
  const [showEWalletPhone, setShowEWalletPhone] = useState(false);
  const [cardNumber,       setCardNumber]       = useState('');
  const [cardExpiry,    setCardExpiry]    = useState('');
  const [cardCvc,       setCardCvc]       = useState('');
  const [cardName,      setCardName]      = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [successModal,       setSuccessModal]       = useState(null); // { orderId, order | null }
  const [failedModal,        setFailedModal]        = useState(false);
  const [pendingVerifyId,    setPendingVerifyId]    = useState(null);
  const [verifyingPayment,   setVerifyingPayment]   = useState(false);
  // Owner-controlled method availability (Homepage CMS → Payment Methods). Missing key = enabled.
  const [payEnabled, setPayEnabled] = useState({});

  // Voucher
  const [voucherInput, setVoucherInput]       = useState('');
  const [appliedVoucher, setAppliedVoucher]   = useState(null);
  const [voucherLoading, setVoucherLoading]   = useState(false);
  const [voucherError, setVoucherError]       = useState(null);

  // Pay in full option for downpayment orders
  const [payFull, setPayFull] = useState(false);
  // Delivery speed is ONE order-level choice (one parcel = one speed). Rush costs more + is faster,
  // subject to the shop's confirmation. An optional exact "need by" date can accompany a Rush.
  const [rush, setRush] = useState(false);
  const [needByDate, setNeedByDate] = useState('');
  // Clickwrap T&C acceptance recorded at the purchase moment (the order-creating step), so every
  // custom order carries proof - not just the product page.
  const [showTerms, setShowTerms] = useState(false);

  // Shipping fee
  const [storeSettings, setStoreSettings]   = useState(null);
  const [shippingFeeAmt, setShippingFeeAmt] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [showPinModal, setShowPinModal]     = useState(false);

  // Courier-booked shipping: no system-calculated fee shown to the customer.
  // The owner books an on-demand courier (Lalamove/Grab) using the customer's pin
  // and adds the real fee to the order afterward. Active when the store hasn't set
  // an explicit fee-based mode (flat / distance).
  const courierBooked = !storeSettings?.shippingMode || storeSettings.shippingMode === 'courier_booked';

  // ── EFFECT: Load store settings for shipping calculation ──
  useEffect(() => {
    fetch(`${API_URL}/api/public/settings`)
      .then(r => r.json())
      .then(d => setStoreSettings(d.data ?? d))
      .catch(() => {});
  }, []);

  // ── EFFECT: Load owner-controlled payment method availability ──
  useEffect(() => {
    fetch(`${API_URL}/api/storefront/content/payment_methods`)
      .then(r => r.json())
      .then(d => { if (d?.data?.enabled && typeof d.data.enabled === 'object') setPayEnabled(d.data.enabled); })
      .catch(() => {});
  }, []);

  // ── EFFECT: Calculate shipping fee when address or store settings change ──
  useEffect(() => {
    const addr = addresses.find(a => a.id === selectedAddressId) ?? null;

    if (courierBooked) { setShippingFeeAmt(null); setShippingLoading(false); return; }

    if (storeSettings?.shippingMode === 'flat') {
      if (!addr) { setShippingFeeAmt(null); return; }
      const fee = isMetroManila(addr.city, addr.province)
        ? (storeSettings.flatRateInsideMetro  ?? 150)
        : (storeSettings.flatRateOutsideMetro ?? 250);
      setShippingFeeAmt(fee);
      return;
    }

    if (!storeSettings?.storeLat || !storeSettings?.storeLng || !addr?.lat || !addr?.lng) {
      setShippingFeeAmt(null);
      return;
    }
    setShippingLoading(true);
    const { storeLat, storeLng, shippingBaseRate = 50, shippingPerKmRate = 15 } = storeSettings;
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${storeLng},${storeLat};${addr.lng},${addr.lat}?overview=false`
    )
      .then(r => r.json())
      .then(d => {
        const distanceM = d.routes?.[0]?.distance ?? null;
        if (distanceM !== null) {
          const distKm = distanceM / 1000;
          setShippingFeeAmt(Math.round((shippingBaseRate + shippingPerKmRate * distKm) * 100) / 100);
        } else {
          setShippingFeeAmt(null);
        }
      })
      .catch(() => setShippingFeeAmt(null))
      .finally(() => setShippingLoading(false));
  }, [selectedAddressId, addresses, storeSettings, courierBooked]);

  // ── EFFECT: Handle return from PayMongo ──
  useEffect(() => {
    const params         = new URLSearchParams(window.location.search);
    const isCancelled    = params.get('payment_cancelled') === '1';
    const fromPayMongo   = isCancelled || (document.referrer || '').includes('paymongo.com');
    const pendingOrderId = sessionStorage.getItem('pending_payment_order_id');

    if (isCancelled) router.replace('/shop/checkout', { scroll: false });

    if (fromPayMongo && pendingOrderId) {
      sessionStorage.removeItem('pending_payment_order_id');
      setVerifyingPayment(true);
      setPendingVerifyId(pendingOrderId);
      return;
    }

    if (isCancelled && !pendingOrderId) setFailedModal(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── EFFECT: Verify payment status after PayMongo return ──
  // Polls up to 6× (12 s) to allow webhook to arrive before concluding.
  useEffect(() => {
    if (!pendingVerifyId || !token) return;
    let cancelled = false;
    let attempt   = 0;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res   = await fetchWithTimeout(`${API_URL}/api/orders/my/${pendingVerifyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }, 10000);
        const data  = await res.json();
        const order = data.data ?? data;
        if (order.paymentStatus === 'paid') {
          if (!cancelled) { setVerifyingPayment(false); setSuccessModal({ orderId: pendingVerifyId, order }); }
        } else if (attempt < 5) {
          attempt++;
          setTimeout(poll, 2000);
        } else {
          if (!cancelled) { setVerifyingPayment(false); setFailedModal(true); }
        }
      } catch {
        if (!cancelled) { setVerifyingPayment(false); setFailedModal(true); }
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [pendingVerifyId, token]);

  // ── EFFECT: Load cart payload from sessionStorage ──
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('checkout_payload');
      if (!raw) {
        setPayloadError(true);
        return;
      }
      const payload = JSON.parse(raw);
      if (!payload.items || payload.items.length === 0) {
        setPayloadError(true);
        return;
      }
      setItems(payload.items);
      setFromCart(payload.fromCart === true);
      if (payload.designUrl) {
        setDesignPreviewUrl(payload.designUrl);
      }
      if (payload.notes && !designNotes) {
        setDesignNotes(payload.notes);
      }
    } catch {
      setPayloadError(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── EFFECT: Redirect if not authenticated ──
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && token === null) {
      router.replace('/shop');
    }
  }, [mounted, token, router]);

  // ── Fetch addresses (also called after pin modal saves) ──
  const fetchAddresses = useCallback(async (keepSelection = false) => {
    if (!token) return;
    setAddressLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/addresses`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      }, 30000);
      if (!res.ok) throw new Error('Failed to load addresses.');
      const data = await res.json();
      const list = data.addresses || [];
      setAddresses(list);
      if (!keepSelection) {
        const def = list.find(a => a.is_default);
        setSelectedAddressId(def?.id ?? list[0]?.id ?? null);
      }
    } catch {
      setError('Failed to load addresses.');
    } finally {
      setAddressLoading(false);
    }
  }, [token]);

  // ── EFFECT: Fetch addresses on mount ──
  useEffect(() => { fetchAddresses(); }, [fetchAddresses]);

  // ── Computed ──
  const selectedAddress = addresses.find(a => a.id === selectedAddressId) ?? null;
  const subtotal        = items.reduce((sum, i) => sum + (i.unitPrice * i.qty), 0);
  // Custom item still needing a design file at checkout (not pre-uploaded and not design-service-requested)
  const hasCustomItem = items.some(i => i.isCustom === true && !i.designUrl && !i.designRequested);
  const voucherDiscount = appliedVoucher ? appliedVoucher.discountAmount : 0;
  const total           = Math.max(0, subtotal - voucherDiscount);
  // ONE design fee for the order, not one per product. The fee buys the artwork, and one
  // artwork put on a mug and a totebag is still a single piece of work - so the highest
  // product's fee applies once rather than every fee being added up.
  // The store-level fee is the truth; a product's own fee is only an override for work
  // that really is harder. Either way it is charged ONCE.
  const wantsDesign = items.some(i => i.designMode === 'request' || i.designRequested);
  const designFee = wantsDesign
    ? Math.max(
        Number(storeSettings?.designRequestFee) || 0,
        ...items
          .filter(i => i.designMode === 'request' || i.designRequested)
          .map(i => Number(i.designFee) || 0),
      )
    : 0;
  // Order-level delivery speed (one parcel = one speed). Rush is faster + costs more, subject to the
  // shop confirming it fits the queue ("kaya ba isabay"). "Get by" ranges come from turnaround config.
  // Rush buys priority in the production queue. A cart of stocked goods has nothing queued, so
  // there is nothing to jump - offering it would sell a promise the shop cannot act on and charge
  // for it. Read from the cart lines, not the products: the same item can be bought plain.
  const needsProduction = items.some(i =>
    i.isCustom || i.isMadeToOrder || i.designUrl || i.designFiles?.length ||
    i.designRequested || i.designMode === 'request' ||
    i.product?.isMadeToOrder
  );


  // Zero when there is nothing to produce, so the date shown at checkout matches the one the server
  // snapshots onto the order. A stocked cart was being quoted the full production lead - eleven days
  // for a bag already on the shelf.
  const prodLead    = needsProduction ? Number(storeSettings?.productionLeadDays ?? 7) : 0;
  const shipMin     = Number(storeSettings?.shippingDaysMin ?? 2);
  const shipMax     = Number(storeSettings?.shippingDaysMax ?? 4);
  const rushEnabled = storeSettings?.rushEnabled !== false && needsProduction;
  const rushLead    = Number(storeSettings?.rushLeadDays ?? 3);
  const rushFeeAmt  = Number(storeSettings?.rushFee ?? 100);
  const addBizDays  = (n) => { const d = new Date(); d.setHours(0,0,0,0); let a = 0; while (a < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) a++; } return d; }; // skip Sundays
  const getByRange  = (lead) => {
    const f = (d) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    const a = addBizDays(lead + shipMin), b = addBizDays(lead + shipMax);
    return a.getTime() === b.getTime() ? f(a) : `${f(a)} - ${f(b)}`;
  };
  const isRush      = rushEnabled && rush;
  const rushCharge  = isRush ? rushFeeAmt : 0;
  // Earliest an optional need-by date may be - no same/next day; at least the rush lead (min 2 biz days).
  const minNeedByStr = addBizDays(Math.max(2, rushLead)).toISOString().slice(0, 10);
  // The latest a Standard order arrives. A need-by date on/after this fits Standard (no rush needed).
  const standardEtaMax = addBizDays(prodLead + shipMax);
  // Picking a date auto-sets the speed: sooner than Standard can make it -> Rush; otherwise Standard.
  const onPickNeedBy = (val) => {
    setNeedByDate(val);
    if (val) setRush(new Date(val + 'T23:59:59') < standardEtaMax);
  };

  const grandTotal      = total + designFee + rushCharge + (shippingFeeAmt ?? 0);

  // Order-level downpayment: if ANY item requires DP, apply the highest DP% to the full order total
  const downpaymentPercent = items
    // Cart lines carry these at the top level; a Buy-Now payload nests them under `product`.
    // Reading only one shape let a made-to-order item slip through the cart with no
    // downpayment required - and with COD still on the table.
    .filter(i => i.requiresDownpayment ?? i.product?.requiresDownpayment)
    .reduce((max, i) => Math.max(max, i.downpaymentPercent ?? i.product?.downpaymentPercent ?? 50), 0);
  // Per-line "pay now" for the goods, so a mixed cart charges each line by its own rule instead
  // of one blanket percent on everything:
  //   - a requested design defers its goods (no artwork yet) - only the design fee is due now;
  //   - a downpayment line pays its own DP% (or full when Pay in full is chosen);
  //   - a ready-made line pays in full.
  // The design fee and shipping are always collected once, now. The rest is the balance, settled
  // from the order detail modal (upload goods balance + requested-design goods after approval).
  const isReqLine = (i) => (i.designMode === 'request' || i.designRequested) && !i.designUrl;
  // A line takes a deposit when the product asks for one - either the flag is set OR a percent is
  // configured (a percent > 0 alone means downpayment, even if the boolean was never saved).
  const lineDpPct = (i) => {
    const pct = Number(i.downpaymentPercent ?? i.product?.downpaymentPercent ?? 0);
    const requires = !!(i.requiresDownpayment ?? i.product?.requiresDownpayment) || pct > 0;
    return requires ? (pct > 0 ? pct : 50) : 0;
  };
  // Every made-to-order line pays its OWN downpayment now (upload AND request alike - one order = one
  // consistent deposit). When all lines share a percent this equals that percent of the goods total;
  // when they differ (e.g. mug 50% + mousepad 30%) it is the exact per-line sum. The design fee is
  // separate (paid once, in full). Request goods are NO LONGER deferred.
  const goodsPayNow = items.reduce((sum, i) => {
    const g = i.unitPrice * i.qty;
    const pct = lineDpPct(i);
    if (pct > 0 && !payFull) return sum + Math.round(g * pct / 100 * 100) / 100;
    return sum + g;                                     // ready-made / no-DP / Pay-in-full -> full line
  }, 0);

  const customItems = items.filter(i => i.isCustom);
  // Request-design orders collect the design fee ALONE at checkout. The customer has not seen any
  // artwork yet, so this is the moment they are least committed - asking for a goods deposit here is
  // both the highest point of abandonment and a refund we would owe if they turn the proof down, and
  // there is no refund flow. The fee is non-refundable and covers the designer's time, so if they
  // walk after seeing the proof nothing is lost: make-to-order means no material was bought either.
  // The goods deposit is collected after the proof is approved.
  // If ANY line wants a design the whole order follows this route - one rule beats splitting a cart's
  // money down two paths.
  const designFeeOnly = wantsDesign && designFee > 0;

  // The T&C was accepted per item on the product page (each mode has its own terms). That acceptance
  // TRAVELS with the cart line - no second prompt here. We aggregate the lines' snapshots into one
  // order-level proof (union of the exact clauses each item agreed to).
  const termsItems = customItems.filter(i => i.termsSnapshot || i.termsVersion != null);
  const termsAgreed = termsItems.length > 0;
  const termsVersion = termsItems[0]?.termsVersion ?? storeSettings?.termsVersion ?? 1;
  const agreedTermsSnapshot = (() => {
    const seen = new Set(); const out = [];
    termsItems.forEach(i => (i.termsSnapshot || []).forEach(c => {
      if (c?.title && !seen.has(c.title)) { seen.add(c.title); out.push({ title: c.title, body: c.body, mode: c.mode || 'both' }); }
    }));
    return out;
  })();
  const termsAgreedAt = termsItems.map(i => i.termsAgreedAt).filter(Boolean).sort()[0] || null;

  const amountDue = designFeeOnly
    ? Math.max(0, Math.round(designFee * 100) / 100)
    : Math.max(0, Math.round((goodsPayNow + designFee + rushCharge + (shippingFeeAmt ?? 0) - voucherDiscount) * 100) / 100);
  const remainingBalance = Math.max(0, Math.round((grandTotal - amountDue) * 100) / 100);
  // "Downpayment" here means the CURRENT selection does not settle the whole order (drives the payload
  // + COD gating). It flips to false when Pay-in-Full clears the balance - correct, but the deposit UI
  // must NOT vanish then or the customer can't switch back. So the box/toggle use a separate "eligible"
  // flag that ignores the current payFull choice.
  const downpaymentRequired = !designFeeOnly && remainingBalance > 0;
  const eligibleForDeposit = designFeeOnly || items.some(i => isReqLine(i) || lineDpPct(i) > 0);
  // Single "X%" only when every line shares the same deposit percent; otherwise per-line (mixed).
  const allDpPcts   = items.map(i => lineDpPct(i));
  const dpUniformPct = allDpPcts.length && allDpPcts.every(p => p === allDpPcts[0] && p > 0) ? allDpPcts[0] : null;

  const cartAllowsCOD = items.every(i => (i.allowCOD ?? i.product?.allowCOD ?? true) !== false);

  // A method is offered only if the owner hasn't disabled it (and COD also obeys cart/DP rules).
  const methodAvailable = (id) => {
    if (payEnabled[id] === false) return false;
    if (id === 'cod') return cartAllowsCOD && !downpaymentRequired;
    return true;
  };
  const availableMethods = ['cod', 'gcash', 'paymaya', 'card'].filter(methodAvailable);

  // Keep the selection valid: if the chosen method becomes unavailable (owner turned it off,
  // COD disallowed, downpayment), fall back to the first available method.
  useEffect(() => {
    if (availableMethods.length && !availableMethods.includes(paymentMethod)) {
      setPaymentMethod(availableMethods[0]);
    }
  }, [availableMethods.join(','), paymentMethod]);

  async function handleApplyVoucher() {
    if (!voucherInput.trim()) return;
    setVoucherLoading(true);
    setVoucherError(null);
    setAppliedVoucher(null);
    try {
      const data = await applyVoucher(token, voucherInput.trim(), subtotal);
      setAppliedVoucher(data.data);
    } catch (err) {
      setVoucherError(err.message);
    } finally {
      setVoucherLoading(false);
    }
  }

  function handleRemoveVoucher() {
    setAppliedVoucher(null);
    setVoucherInput('');
    setVoucherError(null);
  }

  function handleDesignFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (!allowed.includes(file.type)) {
      setError('Design file must be JPG, PNG, WEBP, or PDF.');
      e.target.value = '';
      return;
    }
    if (file.size > maxSize) {
      setError('Design file must be under 10MB.');
      e.target.value = '';
      return;
    }
    setError(null);
    setDesignFile(file);
    if (file.type.startsWith('image/')) {
      setDesignFilePreviewUrl(URL.createObjectURL(file));
    } else {
      setDesignFilePreviewUrl(null);
    }
  }

  // ── Card helpers ──
  const isOnlinePayment = ['gcash', 'paymaya', 'card'].includes(paymentMethod);

  function fmtPHPhone(digits) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return digits.slice(0, 3) + ' ' + digits.slice(3);
    return digits.slice(0, 3) + ' ' + digits.slice(3, 6) + ' ' + digits.slice(6);
  }

  function fmtCardNumber(v) {
    return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  }
  function fmtExpiry(v) {
    const d = v.replace(/\D/g, '').slice(0, 4);
    return d.length >= 3 ? d.slice(0, 2) + '/' + d.slice(2) : d;
  }
  function cardBrand(num) {
    const n = num.replace(/\s/g, '');
    if (/^4/.test(n)) return 'VISA';
    if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'MC';
    if (/^3[47]/.test(n)) return 'AMEX';
    return null;
  }
  function luhnCheck(num) {
    let sum = 0, alt = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let n = parseInt(num[i]);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  function validateCardFields() {
    const num = cardNumber.replace(/\s/g, '');
    if (num.length < 16) return 'Enter a valid 16-digit card number.';
    if (!luhnCheck(num)) return 'Card number is invalid. Please check and try again.';
    const [m, y] = cardExpiry.split('/');
    if (!m || !y || parseInt(m) < 1 || parseInt(m) > 12 || y.length < 2) return 'Enter a valid expiry date (MM/YY).';
    if (cardCvc.length < 3) return 'Enter a valid security code (3–4 digits).';
    if (!cardName.trim()) return 'Enter the name on your card.';
    return null;
  }
  async function tokenizeCard() {
    const publicKey = process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY;
    if (!publicKey || publicKey.includes('REPLACE')) throw new Error('Card payments not configured. Contact support.');
    const [expMonth, expYear] = cardExpiry.split('/');
    const res = await fetch('https://api.paymongo.com/v1/payment_methods', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(publicKey + ':')}`,
      },
      body: JSON.stringify({ data: { attributes: {
        type: 'card',
        details: {
          card_number: cardNumber.replace(/\s/g, ''),
          exp_month: parseInt(expMonth),
          exp_year: parseInt('20' + expYear),
          cvc: cardCvc,
        },
        billing: {
          name: cardName.trim() || currentUser?.name || '',
          email: currentUser?.email || '',
          phone: '',
        },
      }}}),
    });
    const data = await res.json();
    if (!res.ok) {
      const detail = data.errors?.[0]?.detail ?? '';
      if (detail.includes('card_number')) throw new Error('Card number is invalid. Please check and try again.');
      if (detail.includes('exp_month') || detail.includes('exp_year')) throw new Error('Expiry date is invalid. Use MM/YY format.');
      if (detail.includes('cvc')) throw new Error('Security code is invalid.');
      throw new Error('Invalid card details. Please check and try again.');
    }
    return data.data.id;
  }

  // ── Place Order ──
  async function handlePlaceOrder() {
    if (!token) return;
    if (items.length === 0) return;
    if (!selectedAddress) {
      setError('Please select a delivery address.');
      return;
    }

    const needsPin = courierBooked
      || (storeSettings?.shippingMode !== 'flat' && storeSettings?.storeLat && storeSettings?.storeLng);
    if (needsPin && (!selectedAddress.lat || !selectedAddress.lng)) {
      setError(courierBooked
        ? 'Please pin your delivery location so the seller can book your courier accurately.'
        : 'Please pin your delivery location so we can calculate the shipping fee.');
      setShowPinModal(true);
      return;
    }

    if (!selectedAddress.phone?.trim()) {
      setError('Your delivery address is missing a contact number. Please select a different address or update it in your profile.');
      return;
    }
    const requiredFields = ['street', 'barangay', 'city', 'province'];
    const missingField = requiredFields.find(f => !selectedAddress[f]?.trim());
    if (missingField) {
      setError('Your delivery address is incomplete. Please select a different address or update it in your profile.');
      return;
    }

    if (downpaymentRequired && paymentMethod === 'cod') {
      setError('Cash on Delivery is not available for downpayment orders. Please choose an online payment method.');
      return;
    }

    if (isOnlinePayment && amountDue < 100) {
      setError('Minimum payment amount is ₱100.00 for online payment. Please add more items.');
      return;
    }

    if (paymentMethod === 'card') {
      const cardErr = validateCardFields();
      if (cardErr) { setError(cardErr); return; }
    }

    setError(null);
    setPlacing(true);

    try {
      const orderItems = items.map(i => ({
        productId: String(i.product?.id ?? i.product?._id ?? i.productId ?? ''),
        variantId: i.variantId ?? null,
        variantName: i.variantName ?? null,
        qty: Math.max(1, parseInt(i.qty) || 1),
        unitPrice: i.unitPrice,
        ...(i.flashSaleId ? { flashSaleId: String(i.flashSaleId) } : {}),
        ...(i.designUrl ? { designUrl: i.designUrl } : {}),
        ...(i.designName ? { designName: i.designName } : {}),
        ...(i.designFiles?.length ? { designFiles: i.designFiles } : {}),
        ...(i.designNotes ? { designNotes: i.designNotes } : {}),
        // A cart line added from the configurator carries designMode; a Buy-Now payload
        // uses designRequested. Both mean the same thing to the order.
        ...((i.designRequested || i.designMode === 'request')
          ? { designRequested: true, designFee: i.designFee ?? null }
          : {}),
        ...(i.designMode ? { designMode: i.designMode } : {}),
      }));

      const deliveryAddress = {
        label:        selectedAddress.label,
        house_number: selectedAddress.house_number,
        street:       selectedAddress.street,
        subdivision:  selectedAddress.subdivision,
        region:       selectedAddress.region ?? null,
        barangay:     selectedAddress.barangay,
        city:         selectedAddress.city,
        province:     selectedAddress.province,
        zip:          selectedAddress.zip,
        phone:        selectedAddress.phone,
        delivery_notes: selectedAddress.delivery_notes ?? null,
        lat:          selectedAddress.lat ?? null,
        lng:          selectedAddress.lng ?? null,
      };

      let fetchBody;
      let fetchHeaders;

      if (hasCustomItem && designFile) {
        const formData = new FormData();
        formData.append('design_file', designFile);
        formData.append('design_notes', designNotes);
        formData.append('items', JSON.stringify(orderItems));
        formData.append('deliveryAddress', JSON.stringify(deliveryAddress));
        formData.append('paymentMethod', paymentMethod);
        if (appliedVoucher?.code) formData.append('voucherCode', appliedVoucher.code);
        formData.append('shippingFee', String(shippingFeeAmt ?? 0));
        formData.append('isRush', String(isRush));
        if (isRush) formData.append('rushFee', String(rushCharge));
        if (isRush && needByDate) formData.append('needByDate', needByDate);
        if (termsAgreed) {
          formData.append('agreedToTerms', 'true');
          formData.append('termsVersion', String(termsVersion));
          formData.append('agreedTermsSnapshot', JSON.stringify(agreedTermsSnapshot));
          if (termsAgreedAt) formData.append('agreedAt', termsAgreedAt);
        }
        fetchBody = formData;
        fetchHeaders = {
          Authorization: `Bearer ${token}`,
        };
      } else {
        fetchBody = JSON.stringify({
          items: orderItems,
          deliveryAddress,
          design_notes: designNotes || null,
          paymentMethod,
          shippingFee: shippingFeeAmt ?? 0,
          isRush,
          ...(isRush ? { rushFee: rushCharge } : {}),
          ...(isRush && needByDate ? { needByDate } : {}),
          ...(termsAgreed ? { agreedToTerms: true, termsVersion, agreedTermsSnapshot, ...(termsAgreedAt ? { agreedAt: termsAgreedAt } : {}) } : {}),
          ...(appliedVoucher?.code ? { voucherCode: appliedVoucher.code } : {}),
        });
        fetchHeaders = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        };
      }

      if (paymentMethod === 'cod') {
        const res = await fetchWithTimeout(`${API_URL}/api/orders`, {
          method: 'POST', headers: fetchHeaders, body: fetchBody,
        }, 20000);
        const data = await res.json();
        if (!res.ok) {
          const fieldErrors = data.errors ? Object.values(data.errors).flat().join(' ') : null;
          throw new Error(fieldErrors || data.message || 'Failed to place order.');
        }
        const orderId = (data.data?._id ?? data.data?.id ?? data._id ?? data.id);
        if (!orderId) throw new Error('Order created but no ID returned. Please check your orders.');
        sessionStorage.removeItem('checkout_payload');
        router.push(`/shop/payment-success?id=${orderId}&method=cod`);

      } else {
        // Custom payment via Payment Intents — bypasses PayMongo hosted checkout
        let paymentMethodId = null;
        if (paymentMethod === 'card') {
          paymentMethodId = await tokenizeCard();
        }

        const onlineBody = JSON.stringify({
          items: orderItems,
          deliveryAddress,
          design_notes: designNotes || null,
          paymentType: paymentMethod,
          paymentMethodId,
          eWalletPhone: eWalletPhone.trim() ? `+63${eWalletPhone.trim()}` : null,
          shippingFee: shippingFeeAmt ?? 0,
          isRush,
          ...(isRush ? { rushFee: rushCharge } : {}),
          ...(isRush && needByDate ? { needByDate } : {}),
          ...(termsAgreed ? { agreedToTerms: true, termsVersion, agreedTermsSnapshot, ...(termsAgreedAt ? { agreedAt: termsAgreedAt } : {}) } : {}),
          ...(appliedVoucher?.code ? { voucherCode: appliedVoucher.code } : {}),
          ...(designFeeOnly ? { isDesignFeeOnly: true, isCustomOrder: true, designType: 'request' } : {}),
          // firstPaymentAmount is the exact per-line "pay now" figure the customer sees, so the
          // backend charges that instead of a single percent applied to the whole order.
          ...(downpaymentRequired ? { isDownpayment: true, downpaymentPercent, firstPaymentAmount: amountDue } : {}),
        });
        const onlineHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

        const res = await fetchWithTimeout(`${API_URL}/api/payment/initiate`, {
          method: 'POST', headers: onlineHeaders, body: onlineBody,
        }, 25000);

        const data = await res.json();
        if (!res.ok) {
          const fieldErrors = data.errors ? Object.values(data.errors).flat().join(' ') : null;
          throw new Error(fieldErrors || data.message || 'Failed to initiate payment.');
        }

        const { orderId, status, redirectUrl } = data.data ?? data;

        if (status === 'succeeded') {
          sessionStorage.removeItem('checkout_payload');
          clearCart();
          router.push(`/shop/payment-success?id=${orderId}&method=${paymentMethod}`);
        } else if (redirectUrl) {
          sessionStorage.setItem('pending_payment_order_id', orderId);
          window.location.href = redirectUrl;
        } else {
          throw new Error('No redirect URL returned. Please try again.');
        }
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  }

  // ── Helpers ──
  const formatAddress = (addr) => {
    const parts = [
      addr.house_number && addr.street ? `${addr.house_number} ${addr.street}` : '',
      addr.subdivision,
      addr.barangay ? `Brgy. ${addr.barangay}` : '',
      addr.city,
      addr.province,
      addr.zip,
    ].filter(Boolean);
    return parts.join(', ');
  };

  // ── GUARD: payload error ──
  if (payloadError) {
    return (
      <div className="checkout-wrapper">
        <div className="checkout-payload-error">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          <h2>No items found for checkout.</h2>
          <button
            className="checkout-back-cart-link"
            onClick={() => setShowCancelModal(true)}
          >
            {fromCart ? '← Back to Cart' : '← Back to Shop'}
          </button>
        </div>
      </div>
    );
  }

  // ── GUARD: loading skeleton ──
  if (items.length === 0 && !payloadError) {
    return (
      <div className="checkout-wrapper">
        <div className="checkout-loading-state">
          <div className="checkout-spinner" />
          <p>Loading checkout…</p>
        </div>
      </div>
    );
  }

  // ── MAIN RENDER ──
  return (
    <div className="checkout-wrapper">
      <style>{`
        .checkout-card-row { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:0.75rem; }
        @media(max-width:480px){ .checkout-card-row { grid-template-columns:1fr; } }
      `}</style>

      {/* ── Payment Success Modal ── */}
      {successModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: 'var(--dark2)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '18px', padding: '40px 32px', maxWidth: '460px', width: '100%', textAlign: 'center' }}>
            <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(74,222,128,0.1)', border: '2px solid #4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 style={{ color: '#4ade80', fontWeight: 700, fontSize: '1.4rem', marginBottom: 6 }}>Payment Successful!</h2>
            <p style={{ color: 'var(--gray)', fontSize: '0.9rem', marginBottom: 24, lineHeight: 1.6 }}>
              Your payment has been received. We'll start processing your order shortly.
            </p>

            {/* Receipt */}
            <div style={{ background: 'var(--dark3)', borderRadius: '10px', padding: '16px', marginBottom: 24, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: 'var(--gray)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order Receipt</span>
                <span style={{ color: 'var(--white)', fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 600 }}>
                  #{(successModal.orderId || '').slice(-8).toUpperCase()}
                </span>
              </div>
              {successModal.order ? (
                <>
                  {(successModal.order.items || []).map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: 'var(--gray)', fontSize: '0.82rem' }}>
                        {item.productName || item.product_name || 'Item'}
                        {item.variantName ? ` — ${item.variantName}` : ''} ×{item.qty || item.quantity}
                      </span>
                      <span style={{ color: 'var(--white)', fontSize: '0.82rem' }}>
                        ₱{Number(item.lineTotal ?? (item.unitPrice * (item.qty || 1)) ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--gold)', fontWeight: 600, fontSize: '0.85rem' }}>Total Paid</span>
                    <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '0.95rem' }}>
                      ₱{Number(successModal.order.totalAmount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </>
              ) : (
                <p style={{ color: 'var(--gray)', fontSize: '0.82rem', textAlign: 'center', padding: '8px 0' }}>Loading order details…</p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => {
                  sessionStorage.removeItem('checkout_payload');
                  clearCart();
                  router.push('/shop/orders-history');
                }}
                style={{ flex: 1, padding: '11px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 9, fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}
              >
                View Orders
              </button>
              <button
                onClick={() => {
                  sessionStorage.removeItem('checkout_payload');
                  clearCart();
                  router.push('/shop');
                }}
                style={{ flex: 1, padding: '11px', background: 'transparent', color: 'var(--white)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 9, fontWeight: 500, cursor: 'pointer', fontSize: '0.875rem' }}
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Verifying Payment Overlay ── */}
      {verifyingPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--dark2)', borderRadius: '18px', padding: '40px 32px', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, border: '3px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
            <p style={{ color: 'var(--white)', fontWeight: 600, marginBottom: 6 }}>Verifying payment…</p>
            <p style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>Please wait, this may take a few seconds.</p>
          </div>
        </div>
      )}

      {/* ── Payment Cancelled/Failed Modal ── */}
      {failedModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: 'var(--dark2)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '18px', padding: '40px 32px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '2px solid var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </div>
            <h2 style={{ color: 'var(--white)', fontWeight: 700, fontSize: '1.3rem', marginBottom: 8 }}>Payment Cancelled</h2>
            <p style={{ color: 'var(--gray)', fontSize: '0.9rem', marginBottom: 28, lineHeight: 1.6 }}>
              Your payment was not completed. Your cart items are still saved — you can try again anytime.
            </p>
            <button
              onClick={() => setFailedModal(false)}
              style={{ width: '100%', padding: '12px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 9, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* SECTION 1 — Header */}
      <div className="checkout-header">
        <button
          className="checkout-back-btn"
          onClick={() => setShowCancelModal(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          {fromCart ? 'Back to Cart' : 'Back to Shop'}
        </button>
        <span className="checkout-divider">/</span>
        <h1 className="checkout-title">Checkout</h1>
      </div>

      {/* SECTION 2 — Delivery Address */}
      <div className="checkout-card" style={{ borderLeft: '3px solid var(--gold)' }}>
        <div className="checkout-card-header">
          <div className="checkout-section-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            Delivery Address
          </div>
          {selectedAddress && (
            <button className="checkout-change-btn" onClick={() => setShowAddressPicker(true)}>
              Change
            </button>
          )}
        </div>

        {addressLoading ? (
          <div className="checkout-loading-line" />
        ) : selectedAddress ? (
          <div>
            {selectedAddress.label && (
              <span className="checkout-address-badge">{selectedAddress.label}</span>
            )}
            <div className="checkout-address-name">
              {currentUser?.firstName || ''} {currentUser?.lastName || ''}
            </div>
            <div className="checkout-address-phone">{selectedAddress.phone || '—'}</div>
            <div className="checkout-address-text">{formatAddress(selectedAddress)}</div>
            {!selectedAddress.lat && !selectedAddress.lng && storeSettings?.shippingMode !== 'flat' && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.75rem', padding: '0.625rem 0.75rem', background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: '8px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#eab308', lineHeight: 1.5 }}>
                    Pin your location to get a shipping estimate.
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPinModal(true)}
                    style={{ padding: '0.3rem 0.75rem', background: '#eab308', border: 'none', borderRadius: '6px', color: '#000', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Pin Location
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : addresses.length > 0 ? (
          <div>
            <p className="checkout-no-default">No default address. Please select one.</p>
            <button className="checkout-select-btn" onClick={() => setShowAddressPicker(true)}>
              Select Address
            </button>
          </div>
        ) : (
          <div>
            <p className="checkout-no-address">No saved addresses. Please add one in your profile.</p>
            <a href="/shop/profile" target="_blank" rel="noopener noreferrer" className="checkout-profile-link">
              Manage Addresses (opens in new tab) →
            </a>
          </div>
        )}
      </div>

      {/* SECTION 3 — Order Items */}
      <div className="checkout-card">
        <div className="checkout-section-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
          Order Items ({items.length})
        </div>

        {/* Same line shape as the cart: name and total paired on one row, the artwork
            given its own full-width strip instead of being squeezed under the variant. */}
        {items.map((item, idx) => {
          const thumb = item.product.thumbnail || item.product.images?.[0];
          const files = item.designFiles?.length ? item.designFiles : (item.designUrl ? [{ url: item.designUrl, name: item.designName }] : []);
          const wantsDesign = item.designRequested || item.designMode === 'request';
          return (
            <div key={idx} style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
              <div style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', background: 'var(--dark)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {thumb
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>}
              </div>

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.35, color: 'var(--white)' }}>
                      {item.product.name}
                      {item.variantName && <span style={{ fontWeight: 500, color: 'var(--gray)' }}> - {item.variantName}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 3 }}>
                      <span style={{ color: 'var(--gray)', fontSize: '0.76rem' }}>
                        {item.qty} × ₱{Number(item.unitPrice).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {/* Per-line deposit indicator so a mixed cart (e.g. mug 50%, mousepad 30%, scrunchie full) is clear. */}
                      {lineDpPct(item) > 0 ? (
                        <span style={{ background: 'rgba(245,158,11,0.12)', color: '#b45309', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 999, padding: '1px 7px', fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          {lineDpPct(item)}% deposit
                        </span>
                      ) : (
                        <span style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 999, padding: '1px 7px', fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          Pay in full
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', whiteSpace: 'nowrap', color: 'var(--white)' }}>
                    ₱{(item.unitPrice * item.qty).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>

                {/* A confirmation screen states facts; it should not celebrate them. The
                    thumbnails carry the meaning, so the strip stays neutral - a bright
                    green badge here reads as an alert, not as "this is in order". */}
                {item.isCustom && (files.length > 0 || wantsDesign) && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    padding: '7px 9px', borderRadius: 9,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border)',
                  }}>
                    {files.length > 0 ? (
                      <>
                        {files.slice(0, 5).map((f, i) => (
                          <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" title={f.name || 'design'}
                            style={{ width: 30, height: 30, borderRadius: 6, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dark)', border: '1px solid var(--border)' }}>
                            {/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(f.url)
                              /* eslint-disable-next-line @next/next/no-img-element */
                              ? <img src={f.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
                          </a>
                        ))}
                        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--gray)' }}>
                          {files.length} file{files.length === 1 ? '' : 's'} attached
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--gray)' }}>
                        We design this for you
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* SECTION 3B – Design Upload (only shown for custom print products) */}
      {hasCustomItem && <div className="checkout-card">
        <div className="checkout-section-label" style={{ marginBottom: '0.75rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Design File
          <span style={{ marginLeft: '0.5rem', fontStyle: 'normal', fontWeight: 400, color: 'var(--gray)', textTransform: 'none', letterSpacing: 0, fontSize: '0.72rem' }}>
            — Optional
          </span>
        </div>

        {/* Design preview from product page — B-06 */}
        {((designPreviewUrl && !designFile) || designFilePreviewUrl) && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: '0.75rem',
            background: 'rgba(212,168,67,0.06)',
            border: '1px solid rgba(212,168,67,0.25)',
            borderRadius: '8px',
            marginBottom: '0.75rem',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={designFilePreviewUrl || designPreviewUrl}
              alt="Attached design"
              style={{
                width: 64,
                height: 64,
                objectFit: 'cover',
                borderRadius: '6px',
                flexShrink: 0,
                border: '1px solid var(--border)',
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'var(--gold)',
                marginBottom: '0.25rem',
              }}>
                Design attached from product page
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: 'var(--gray)',
                lineHeight: 1.5,
              }}>
                To include this file in your order, please re-select
                it below before placing your order.
              </div>
            </div>
          </div>
        )}

        {/* Upload area */}
        <label
          htmlFor="design-upload"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            background: designFile ? 'rgba(212,168,67,0.06)' : 'var(--dark)',
            border: designFile
              ? '1px solid rgba(212,168,67,0.4)'
              : '1px dashed rgba(255,255,255,0.12)',
            borderRadius: '10px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {designFile ? (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <polyline points="16 13 12 17 8 13"/>
                <line x1="12" y1="17" x2="12" y2="9"/>
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {designFile.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.15rem' }}>
                  {(designFile.size / (1024 * 1024)).toFixed(2)} MB
                </div>
              </div>
              <button
                type="button"
                onClick={e => { e.preventDefault(); setDesignFile(null); setDesignFilePreviewUrl(null); document.getElementById('design-upload').value = ''; }}
                style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--white)', fontWeight: 500 }}>
                  Attach your design
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '0.15rem' }}>
                  JPG, PNG, WEBP, or PDF · Max 10MB
                </div>
              </div>
            </>
          )}
        </label>

        <input
          id="design-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={handleDesignFileChange}
          style={{ display: 'none' }}
        />

        {/* Image quality notice */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
          marginTop: '0.625rem',
          padding: '0.625rem 0.75rem',
          background: 'rgba(212,168,67,0.05)',
          border: '1px solid rgba(212,168,67,0.15)',
          borderRadius: '8px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,marginTop:'1px'}}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style={{ fontSize: '0.75rem', color: 'rgba(212,168,67,0.8)', lineHeight: 1.5 }}>
            Please make sure your image is clear and high resolution so our team can accurately evaluate your design. Blurry or low-quality files may cause delays.
          </span>
        </div>

        {/* Skip note */}
        <p style={{ margin: '0.625rem 0 0', fontSize: '0.72rem', color: 'var(--gray)', lineHeight: 1.5 }}>
          No file yet? You can skip this and send your design later via our chat support.
        </p>

        <div style={{ marginTop: '0.75rem' }}>
          <label
            htmlFor="design-notes"
            style={{
              display: 'block',
              fontSize: '0.75rem',
              color: 'var(--gray)',
              marginBottom: '0.375rem',
              fontWeight: 500,
            }}
          >
            Design Notes
            <span style={{ marginLeft: '0.375rem', fontWeight: 400, opacity: 0.7 }}>— Optional</span>
          </label>
          <textarea
            id="design-notes"
            rows={3}
            maxLength={500}
            className="checkout-notes-input"
            placeholder="Describe what you want printed — colors, text, placement, size, or any other details..."
            value={designNotes}
            onChange={e => setDesignNotes(e.target.value.slice(0, 500))}
          />
        </div>
      </div>}

      {/* SECTION 4C — Delivery speed (order-level Standard / Rush). Same card + toggle design language
          as the cart and the per-product custom page. */}
      {rushEnabled && (
        <div className="checkout-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.92rem' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            Delivery speed
          </div>
          {[{ key: false, label: 'Standard', lead: prodLead, fee: 0 }, { key: true, label: 'Rush', lead: rushLead, fee: rushFeeAmt }].map(opt => {
            const active = rush === opt.key;
            // Choosing a speed directly clears any specific date (the two are alternative ways in).
            return (
              <button key={String(opt.key)} type="button" onClick={() => { setRush(opt.key); setNeedByDate(''); }}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '11px 14px', borderRadius: '10px', border: `1.5px solid ${active ? 'var(--gold)' : 'var(--border)'}`, background: active ? 'rgba(212,168,67,0.08)' : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'all .15s' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${active ? 'var(--gold)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {active && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} />}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: active ? 'var(--gold)' : 'var(--white, #111)' }}>{opt.label}</span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--gray)' }}>Get by {getByRange(opt.lead)}</span>
                  </span>
                </span>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: opt.fee > 0 ? 'var(--gold)' : 'var(--gray)' }}>{opt.fee > 0 ? `+₱${opt.fee.toLocaleString('en-PH')}` : 'Free'}</span>
              </button>
            );
          })}

          {/* Optional exact deadline. Picking a date auto-sets the speed above: sooner than Standard can
              make it -> Rush; otherwise Standard (no fee). The native "dd/mm/yyyy" is hidden. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Need it by a specific date?</span>
            <label onClick={(e) => { const inp = e.currentTarget.querySelector('input[type="date"]'); try { inp?.showPicker(); } catch { inp?.focus(); } }}
              style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, border: `1.5px solid ${needByDate ? 'var(--gold)' : 'var(--border)'}`, borderRadius: '9px', background: 'var(--dark2, #f9fafb)', padding: '7px 11px', cursor: 'pointer', minWidth: 140 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: needByDate ? 'var(--white, #111)' : 'var(--gray)', flex: 1 }}>
                {needByDate ? new Date(needByDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Pick a date'}
              </span>
              {needByDate && <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setNeedByDate(''); }} title="Clear" style={{ position: 'relative', zIndex: 2, background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>&times;</button>}
              <input type="date" value={needByDate} min={minNeedByStr} onChange={e => onPickNeedBy(e.target.value)}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, margin: 0, padding: 0, border: 'none', cursor: 'pointer' }} />
            </label>
            <span style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>(optional)</span>
          </div>
          {needByDate && !isRush && (
            <div style={{ fontSize: '0.75rem', color: '#16a34a', lineHeight: 1.5 }}>
              Standard delivery fits this date - no rush fee.
            </div>
          )}
          {isRush && (
            <div style={{ padding: '9px 12px', borderRadius: '9px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <span style={{ fontSize: '0.75rem', color: '#b45309', lineHeight: 1.5 }}>Rush is <strong>subject to our confirmation</strong> based on our current queue. If we cannot make it, we will notify you.</span>
            </div>
          )}
        </div>
      )}

      {/* SECTION 5 — Order Summary */}
      <div className="checkout-card checkout-summary-card">
        <div className="checkout-summary-row">
          <span>Subtotal</span>
          <span>₱{subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        {designFee > 0 && (
          <div className="checkout-summary-row">
            <span>
              Design fee
              <span style={{ display: 'block', fontSize: '.7rem', opacity: .7 }}>
                Charged once, however many products the artwork goes on
              </span>
            </span>
            <span>₱{designFee.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
        <div className="checkout-summary-row">
          <span>Delivery</span>
          {courierBooked ? (
            <span className="checkout-shipping-note" style={{ textAlign: 'right' }}>Arranged after order</span>
          ) : shippingLoading ? (
            <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Calculating…</span>
          ) : shippingFeeAmt !== null ? (
            <span>₱{shippingFeeAmt.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          ) : (() => {
            const addr = addresses.find(a => a.id === selectedAddressId);
            if (storeSettings?.shippingMode === 'flat' && !addr)
              return <span className="checkout-shipping-note">Select an address</span>;
            if ((!storeSettings?.storeLat || !storeSettings?.storeLng) && storeSettings?.shippingMode !== 'flat')
              return <span className="checkout-shipping-note">—</span>;
            if (!addr?.lat || !addr?.lng)
              return (
                <button type="button" className="checkout-shipping-note" style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', padding: 0, fontWeight: 600, fontSize: 'inherit', textDecoration: 'underline' }} onClick={() => setShowPinModal(true)}>
                  Pin your address
                </button>
              );
            return <span className="checkout-shipping-note">—</span>;
          })()}
        </div>
        {isRush && rushCharge > 0 && (
          <div className="checkout-summary-row">
            <span>
              Rush fee
              <span style={{ display: 'block', fontSize: '.7rem', opacity: .7 }}>
                Faster than standard - subject to confirmation
              </span>
            </span>
            <span style={{ color: 'var(--gold)' }}>₱{rushCharge.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
        <div className="checkout-divider" />

        {/* Voucher Code */}
        <div style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
          {!appliedVoucher ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                maxLength={50}
                value={voucherInput}
                onChange={e => setVoucherInput(e.target.value.toUpperCase().slice(0, 50))}
                onKeyDown={e => e.key === 'Enter' && handleApplyVoucher()}
                placeholder="Voucher code"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  backgroundColor: 'var(--dark)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--white)',
                  fontSize: '13px',
                  outline: 'none',
                  fontFamily: 'monospace',
                  letterSpacing: '1px',
                }}
              />
              <button
                onClick={handleApplyVoucher}
                disabled={voucherLoading || !voucherInput.trim()}
                style={{
                  padding: '8px 14px',
                  background: 'var(--gold)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#000',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: voucherLoading || !voucherInput.trim() ? 'not-allowed' : 'pointer',
                  opacity: voucherLoading || !voucherInput.trim() ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {voucherLoading ? '…' : 'Apply'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)', borderRadius: '8px' }}>
              <div>
                <span style={{ fontSize: '0.78rem', color: 'var(--gold)', fontWeight: 700, fontFamily: 'monospace' }}>{appliedVoucher.code}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--gray)', marginLeft: '0.5rem' }}>
                  {appliedVoucher.discountType === 'percentage'
                    ? `${appliedVoucher.discountValue}% off`
                    : `₱${Number(appliedVoucher.discountValue).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} off`}
                </span>
              </div>
              <button onClick={handleRemoveVoucher} style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>✕</button>
            </div>
          )}
          {voucherError && (
            <div style={{ marginTop: '0.375rem', fontSize: '0.78rem', color: '#ef4444' }}>{voucherError}</div>
          )}
        </div>

        {/* Voucher Discount Line */}
        {appliedVoucher && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            <span style={{ color: '#22c55e' }}>Voucher Discount</span>
            <span style={{ color: '#22c55e', fontWeight: 600 }}>− ₱{Number(voucherDiscount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
        )}

        <div className="checkout-summary-total">
          <span>Total</span>
          <span className="checkout-total-amount">₱{grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        {courierBooked && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '8px', padding: '10px 12px', background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
              <rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
            <span style={{ fontSize: '0.75rem', color: 'var(--gray-light)', lineHeight: 1.5 }}>
              Total above excludes delivery. The seller books a courier to your pinned location after your order is confirmed, then advises the shipping fee (paid to the rider or the seller).
            </span>
          </div>
        )}
        {eligibleForDeposit && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px', padding: '8px 10px', background: 'rgba(212,168,67,0.08)', borderRadius: '8px', border: '1px solid rgba(212,168,67,0.2)' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold)' }}>Due Now</span>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--gold)' }}>₱{amountDue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            {designFeeOnly && (
              <span style={{ display: 'block', width: '100%', fontSize: '0.72rem', color: 'var(--gray)', marginTop: 4, lineHeight: 1.5 }}>
                Design fee only, and it is non-refundable - it pays for the designer&apos;s time. The remaining ₱{remainingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (goods + delivery) is paid from My Orders once you approve the proof, so you see the artwork before you pay for the order.
              </span>
            )}
          </div>
        )}

        {eligibleForDeposit && !designFeeOnly && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.75rem 1rem',
            borderRadius: '10px',
            background: 'rgba(212,168,67,0.07)',
            border: '1px solid rgba(212,168,67,0.3)',
            display: 'flex',
            gap: '0.625rem',
            alignItems: 'flex-start',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '0.2rem' }}>
                {dpUniformPct ? `${dpUniformPct}% Downpayment` : 'Downpayment Required'}{dpUniformPct ? '' : ' (mixed rates)'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(212,168,67,0.75)', lineHeight: 1.5 }}>
                {payFull && remainingBalance === 0 ? (
                  <>You&apos;re paying the <strong>full amount of ₱{grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> upfront. No balance on completion.</>
                ) : (
                  <>You&apos;ll pay{' '}
                  <strong>₱{amountDue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>{' '}
                  now (deposit on your items{designFee > 0 ? ' + the design fee' : ''}; ready-made items in full). The remaining{' '}
                  <strong>₱{remainingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>{' '}
                  is collected before delivery. COD is not available.</>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '0.6rem' }}>
                <button
                  type="button"
                  onClick={() => setPayFull(false)}
                  style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(212,168,67,0.5)', background: !payFull ? 'var(--gold)' : 'transparent', color: !payFull ? '#000' : 'var(--gold)' }}
                >
                  Pay Deposit Now
                </button>
                <button
                  type="button"
                  onClick={() => setPayFull(true)}
                  style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(212,168,67,0.5)', background: payFull ? 'var(--gold)' : 'transparent', color: payFull ? '#000' : 'var(--gold)' }}
                >
                  Pay in Full
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 6 — Payment Method */}
      <div className="checkout-card">
        <div className="checkout-section-label" style={{ marginBottom: '0.75rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
          </svg>
          Payment Method
        </div>

        {/* Payment method cards — COD → GCash → Maya → Card */}
        {([
          {
            id: 'cod',
            label: 'Cash on Delivery',
            sub: 'Pay when your order arrives. Our team will contact you for details.',
            accent: 'var(--gold)',
            accentBg: 'rgba(212,168,67,0.08)',
            logo: null,
            icon: (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 7V5a2 2 0 0 0-4 0v2"/>
                <line x1="12" y1="12" x2="12" y2="16"/>
                <circle cx="12" cy="12" r=".5" fill="currentColor"/>
              </svg>
            ),
          },
          {
            id: 'gcash',
            label: 'GCash',
            sub: "You'll be redirected to GCash to authorize payment.",
            accent: '#0066FF',
            accentBg: 'rgba(0,102,255,0.07)',
            logo: '/logos/Gcash-Logo-1024x1024.png',
            icon: null,
          },
          {
            id: 'paymaya',
            label: 'Maya',
            sub: "You'll be redirected to Maya to authorize payment.",
            accent: '#00B14F',
            accentBg: 'rgba(0,177,79,0.07)',
            logo: '/logos/maya logo.png',
            icon: null,
          },
          {
            id: 'card',
            label: 'Credit / Debit Card',
            sub: 'Pay securely with Visa or Mastercard.',
            accent: '#9C7BE8',
            accentBg: 'rgba(156,123,232,0.07)',
            logo: '/logos/credit-card.svg',
            filterImg: true,
            icon: null,
          },
        ].filter(opt => methodAvailable(opt.id))).map(opt => {
          const isSelected = paymentMethod === opt.id;
          const isEWallet = opt.id === 'gcash' || opt.id === 'paymaya';
          const showPanel = isEWallet && isSelected;
          return (
            <React.Fragment key={opt.id}>
              <div
                onClick={() => { setPaymentMethod(opt.id); setEWalletPhone(''); setShowEWalletPhone(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.875rem',
                  padding: '0.875rem 1rem', borderRadius: '10px', cursor: 'pointer',
                  border: `1px solid ${isSelected ? opt.accent : 'var(--border)'}`,
                  background: isSelected ? opt.accentBg : 'var(--dark)',
                  marginBottom: showPanel ? '0' : '0.625rem', transition: 'all 0.18s',
                }}
              >
                {/* Logo / icon box */}
                <div style={{
                  width: '44px', height: '44px', borderRadius: '10px', flexShrink: 0,
                  background: opt.logo ? (isSelected ? opt.accentBg : 'var(--dark2)') : (isSelected ? opt.accentBg : 'var(--dark2)'),
                  border: `1px solid ${isSelected ? opt.accent : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isSelected ? opt.accent : 'var(--gray)',
                  overflow: 'hidden', transition: 'all 0.18s',
                }}>
                  {opt.logo
                    ? <img
                        src={opt.logo}
                        alt={opt.label}
                        style={{
                          width: '30px', height: '30px', objectFit: 'contain',
                          ...(opt.filterImg
                            ? { filter: theme === 'light' ? 'brightness(0) opacity(0.55)' : 'brightness(0) invert(1)', opacity: isSelected ? 1 : 0.45 }
                            : { borderRadius: '6px' }),
                        }}
                      />
                    : opt.icon
                  }
                </div>

                {/* Label + sub */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.15rem' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                    {opt.sub}
                    {opt.id !== 'cod' && grandTotal < 100 && (
                      <span style={{ color: 'var(--red)', display: 'block', marginTop: '0.2rem' }}>
                        ⚠ Minimum ₱100.00 required.
                      </span>
                    )}
                  </div>
                </div>

                {/* Radio dot */}
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.2)'}`,
                  background: isSelected ? opt.accent : 'transparent',
                  transition: 'all 0.18s',
                }} />
              </div>

              {/* Inline e-wallet panel — appears directly below its own card */}
              {showPanel && (
                <div style={{
                  marginTop: '4px', marginBottom: '0.625rem',
                  padding: '0.875rem 1rem', borderRadius: '10px',
                  background: opt.id === 'gcash' ? 'rgba(0,102,255,0.04)' : 'rgba(0,177,79,0.04)',
                  border: `1px solid ${opt.id === 'gcash' ? 'rgba(0,102,255,0.18)' : 'rgba(0,177,79,0.18)'}`,
                }}>
                  {!showEWalletPhone ? (
                    <button
                      type="button"
                      onClick={() => setShowEWalletPhone(true)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        color: opt.id === 'gcash' ? '#0066FF' : '#00B14F',
                        fontSize: '0.8rem', fontWeight: 600,
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                      </svg>
                      Use a different {opt.id === 'gcash' ? 'GCash' : 'Maya'} number for billing reference
                    </button>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: opt.id === 'gcash' ? '#0066FF' : '#00B14F', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {opt.id === 'gcash' ? 'GCash' : 'Maya'} number
                        </span>
                        <button
                          type="button"
                          onClick={() => { setShowEWalletPhone(false); setEWalletPhone(''); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', fontSize: '0.75rem', padding: 0 }}
                        >
                          Cancel
                        </button>
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center',
                        background: 'var(--dark2)', border: '1px solid var(--border)',
                        borderRadius: '8px', overflow: 'hidden',
                      }}
                        onFocusCapture={e => { e.currentTarget.style.borderColor = opt.id === 'gcash' ? '#0066FF' : '#00B14F'; }}
                        onBlurCapture={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                      >
                        <span style={{
                          padding: '0.65rem 0.75rem', fontSize: '0.9rem', fontFamily: 'monospace',
                          color: 'var(--gray)', borderRight: '1px solid rgba(255,255,255,0.08)',
                          flexShrink: 0, userSelect: 'none',
                        }}>+63</span>
                        <input
                          type="tel"
                          inputMode="numeric"
                          placeholder="9XX XXX XXXX"
                          maxLength={12}
                          value={fmtPHPhone(eWalletPhone)}
                          autoFocus
                          onChange={e => setEWalletPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          style={{
                            flex: 1, background: 'transparent', border: 'none',
                            padding: '0.65rem 0.875rem',
                            color: 'var(--white)', fontSize: '0.9rem', outline: 'none',
                            fontFamily: 'monospace',
                          }}
                        />
                      </div>
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                        For billing reference only. Actual authorization happens in the {opt.id === 'gcash' ? 'GCash' : 'Maya'} app.
                      </p>
                    </>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* Card form */}
        {paymentMethod === 'card' && (
          <div style={{
            marginTop: '0.25rem', padding: '1.25rem', borderRadius: '12px',
            background: 'rgba(156,123,232,0.05)', border: '1px solid rgba(156,123,232,0.2)',
          }}>
            {/* Header with card logos */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(156,123,232,0.9)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Card Details
              </span>
              <CardLogosBig />
            </div>

            {/* Card number */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
                Card number
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text" inputMode="numeric" placeholder="1234 1234 1234 1234"
                  value={cardNumber}
                  onChange={e => setCardNumber(fmtCardNumber(e.target.value))}
                  style={{
                    width: '100%', background: '#ffffff', border: '1px solid var(--border)',
                    borderRadius: '8px', padding: '0.72rem 2.75rem 0.72rem 0.875rem',
                    color: '#111827', fontSize: '1rem', outline: 'none', boxSizing: 'border-box',
                    fontFamily: 'monospace', letterSpacing: '0.08em',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#9C7BE8'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
                />
                {cardBrand(cardNumber) && (
                  <span style={{
                    position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                    fontSize: '0.6rem', fontWeight: 900, color: '#9C7BE8', letterSpacing: '0.04em',
                    background: 'rgba(156,123,232,0.12)', padding: '2px 6px', borderRadius: '4px',
                  }}>
                    {cardBrand(cardNumber)}
                  </span>
                )}
              </div>
            </div>

            {/* Expiry + CVC */}
            <div className="checkout-card-row" style={{ display: 'grid', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
                  Expiration date
                </label>
                <input
                  type="text" inputMode="numeric" placeholder="MM / YY"
                  value={cardExpiry}
                  onChange={e => setCardExpiry(fmtExpiry(e.target.value))}
                  style={{
                    width: '100%', background: '#ffffff', border: '1px solid var(--border)',
                    borderRadius: '8px', padding: '0.72rem 0.875rem',
                    color: '#111827', fontSize: '0.95rem', outline: 'none',
                    fontFamily: 'monospace', boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#9C7BE8'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
                  Security code
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text" inputMode="numeric" placeholder="CVC"
                    maxLength={4} value={cardCvc}
                    onChange={e => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    style={{
                      width: '100%', background: '#ffffff', border: '1px solid var(--border)',
                      borderRadius: '8px', padding: '0.72rem 2.25rem 0.72rem 0.875rem',
                      color: '#111827', fontSize: '0.95rem', outline: 'none',
                      fontFamily: 'monospace', boxSizing: 'border-box',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#9C7BE8'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
                  />
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5"
                    style={{ position: 'absolute', right: '0.625rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Cardholder name */}
            <div style={{ marginBottom: '0.875rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
                Name on card
              </label>
              <input
                type="text" placeholder="Full name as on card"
                value={cardName}
                onChange={e => setCardName(e.target.value)}
                style={{
                  width: '100%', background: '#ffffff', border: '1px solid var(--border)',
                  borderRadius: '8px', padding: '0.72rem 0.875rem',
                  color: '#111827', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => { e.target.style.borderColor = '#9C7BE8'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(156,123,232,0.7)" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>
                Card details encrypted and sent directly to PayMongo — never stored on our servers.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* T&C was accepted per item on the product page and travels with the line - no re-prompt.
          A read-only note lets the customer review exactly what they accepted. */}
      {termsAgreed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0.5rem 0', fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>
          <span>You accepted the{' '}
            <button type="button" onClick={() => setShowTerms(true)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--gold)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit' }}>Custom Order Terms</button>{' '}when you added these items.
          </span>
        </div>
      )}

      {/* SECTION 7 — Place Order Button */}
      {error && (
        <div className="checkout-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      <button
        onClick={handlePlaceOrder}
        disabled={placing || !selectedAddress || items.length === 0 || (isOnlinePayment && grandTotal < 100)}
        className="checkout-place-btn"
      >
        {placing ? (
          <>
            <svg className="checkout-spinner-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1"/>
            </svg>
            {paymentMethod === 'card' ? 'Processing...' : 'Placing Order...'}
          </>
        ) : (
          paymentMethod === 'cod' ? 'Place Order' : paymentMethod === 'gcash' ? 'Pay with GCash' : paymentMethod === 'paymaya' ? 'Pay with Maya' : 'Pay with Card'
        )}
      </button>

      {/* Custom Order Terms modal (the exact clauses being agreed to + recorded). */}
      {showTerms && (
        <div onClick={() => setShowTerms(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--dark2, #fff)', color: 'var(--white, #111)', borderRadius: '14px', maxWidth: 560, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
              <strong style={{ fontSize: '1rem' }}>Custom Order Terms</strong>
              <button onClick={() => setShowTerms(false)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
            </div>
            <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {agreedTermsSnapshot.map((t, i) => (
                <div key={i}>
                  <div style={{ fontWeight: 700, color: 'var(--gold)', fontSize: '0.9rem', marginBottom: '3px' }}>{i + 1}. {t.title}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--gray)', lineHeight: 1.55 }}>{t.body}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1.25rem', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>Terms v{termsVersion} - accepted when you added these items</span>
              <button onClick={() => setShowTerms(false)} style={{ padding: '8px 18px', background: 'var(--gold)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      <p className="checkout-disclaimer">
        {paymentMethod === 'cod'
          ? courierBooked
            ? 'By placing this order, you agree to our terms. You pay the item total on delivery; the courier fee is arranged by the seller after booking.'
            : shippingFeeAmt !== null
              ? 'By placing this order, you agree to our terms. You will pay upon delivery including the estimated shipping fee.'
              : 'By placing this order, you agree to our terms. You will pay upon delivery. Exact delivery fee may vary.'
          : paymentMethod === 'gcash'
            ? 'By placing this order, you agree to our terms. You\'ll be redirected to GCash to complete payment.'
            : paymentMethod === 'paymaya'
              ? 'By placing this order, you agree to our terms. You\'ll be redirected to Maya to complete payment.'
              : 'By placing this order, you agree to our terms. Your card details are processed securely by PayMongo.'}
      </p>

      {/* ADDRESS PICKER MODAL */}
      {showAddressPicker && (
        <div className="checkout-modal-overlay" onClick={() => setShowAddressPicker(false)}>
          <div className="checkout-modal-content" onClick={e => e.stopPropagation()}>
            <div className="checkout-modal-header">
              <h2 className="checkout-modal-title">Select Delivery Address</h2>
              <button className="checkout-modal-close" onClick={() => setShowAddressPicker(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="checkout-modal-body">
              {addresses.map(addr => (
                <div
                  key={addr.id}
                  className={`checkout-addr-card ${addr.id === selectedAddressId ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedAddressId(addr.id);
                    setShowAddressPicker(false);
                  }}
                >
                  <div className={`checkout-addr-radio ${addr.id === selectedAddressId ? 'selected' : ''}`} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      {addr.label && <span className="checkout-address-badge">{addr.label}</span>}
                      {addr.is_default && <span className="checkout-default-badge">Default</span>}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                      {formatAddress(addr)}
                    </div>
                    {addr.phone && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginTop: '0.25rem' }}>
                        {addr.phone}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="checkout-modal-footer">
              <a href="/shop/profile" target="_blank" rel="noopener noreferrer" className="checkout-manage-link">
                Manage Addresses (opens in new tab) →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* PIN LOCATION MODAL */}
      {showPinModal && (
        // No backdrop-close: holds the address + map-pin form; a stray click would wipe it.
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 3000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}
        >
          <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '580px', marginTop: '2rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--white)', fontWeight: 700 }}>Pin Your Delivery Location</h2>
              <button onClick={() => setShowPinModal(false)} style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <AddressBook
              initialEditAddress={selectedAddress}
              onSaved={() => {
                fetchAddresses(true);
                setShowPinModal(false);
              }}
            />
          </div>
        </div>
      )}

      {showCancelModal && (
        <div
          onClick={() => setShowCancelModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '2rem',
              width: '100%',
              maxWidth: '420px',
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: '1.125rem', color: 'var(--white)' }}>
              Cancel Checkout?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: 'var(--gray)', lineHeight: 1.5 }}>
              Are you sure you want to go back? Your cart items will be kept.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCancelModal(false)}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--white)', fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Continue Checkout
              </button>
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  router.push(fromCart ? '/shop/cart' : '/shop');
                }}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: 'none',
                  background: 'var(--red)',
                  color: 'var(--white)', fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

