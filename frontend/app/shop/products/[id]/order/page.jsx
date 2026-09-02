'use client';
import { optionGroupsOf, defaultOptionSelection, selectedOptionList, optionsUnitAdd, optionsOrderAdd, withOptionSuffix, optionKey, groupKey } from '@/lib/shopUtils';
import NoImage from '@/components/NoImage';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { uploadDesignFile } from '@/lib/orderRequestApi';
import { useCart } from '@/context/CartContext';
import useLockBodyScroll from '@/lib/useLockBodyScroll';
import { compressImage } from '@/lib/compressImage';
import { DEFAULT_CUSTOM_ORDER_TERMS, renderTermsBody } from '@/lib/customOrderTerms';

const METRO_CITIES = ['Manila', 'Quezon City', 'Caloocan', 'Las Piñas', 'Makati', 'Malabon', 'Mandaluyong', 'Marikina', 'Muntinlupa', 'Navotas', 'Parañaque', 'Pasay', 'Pasig', 'Pateros', 'San Juan', 'Taguig', 'Valenzuela'];
function isMetroManila(city, province) {
  const p = (province || '').toLowerCase();
  const c = (city || '').toLowerCase();
  return p.includes('metro manila') || p.includes('ncr') || p.includes('national capital')
    || METRO_CITIES.some(m => c.includes(m.toLowerCase()));
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function fmt(n) {
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPHPhone(d) {
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.slice(0,3)+' '+d.slice(3);
  return d.slice(0,3)+' '+d.slice(3,6)+' '+d.slice(6);
}
function fmtCardNumber(v) { return v.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim(); }
function fmtExpiry(v) { const d=v.replace(/\D/g,'').slice(0,4); return d.length>=3?d.slice(0,2)+'/'+d.slice(2):d; }
function cardBrand(num) {
  const n=num.replace(/\s/g,'');
  if(/^4/.test(n)) return 'VISA';
  if(/^5[1-5]/.test(n)||/^2[2-7]/.test(n)) return 'MC';
  return null;
}

function getTierForQty(p, qty) {
  const tiers = p?.priceTiers ?? p?.tiers ?? [];
  if (!tiers.length) return null;
  const sorted = [...tiers].sort((a, b) => (parseInt(a.minQty) || 0) - (parseInt(b.minQty) || 0));
  let match = sorted[sorted.length - 1];
  for (const t of sorted) {
    const min = parseInt(t.minQty) || 0;
    const max = t.maxQty !== null && t.maxQty !== '' ? parseInt(t.maxQty) : Infinity;
    if (qty >= min && qty <= max) { match = t; break; }
  }
  return match;
}

// What an "as is" choice records on the order. It is a real instruction, not a blank: the
// printer reads the same field either way.
const AS_IS_NOTE = 'Print exactly as the file is - no changes.';
const MAX_DESIGN_FILES = 5;    // artwork to be printed
const MAX_REFERENCE_FILES = 10;  // photos we design FROM - a collage is legitimately many
// Matched by extension, not MIME type: browsers report .ai as application/pdf and .psd as
// octet-stream, so a MIME whitelist rejects the very formats a designer sends.
const ACCEPTED_RE = /\.(jpe?g|png|webp|pdf|ai|psd|svg)$/i;

// Variant options come back either as plain strings or as {value,label} objects,
// so every read has to go through this (matches the product page).
const optValue = (opt) => (typeof opt === 'string' ? opt : (opt?.value ?? opt?.label ?? ''));
const optLabel = (opt) => (typeof opt === 'string' ? opt : (opt?.label ?? opt?.value ?? ''));

// Custom-order terms the customer must accept before ordering (own wording, not copied).
// mode: which design flow the clause applies to - 'both', 'upload' (customer file), or 'request'
// (we design it). The storefront shows only clauses for the chosen mode + 'both'.
const CUSTOM_ORDER_TERMS = DEFAULT_CUSTOM_ORDER_TERMS;

// Two shapes exist in the data. Older products carry an explicit `combo` map per
// combination; the current product editor writes flat `{id, name}` rows instead.
// Matching only the old shape returned null for every current product, which is why
// the variant name showed correctly but its image and price never resolved.
function resolveCombo(product, variants) {
  if (!product?.combinations?.length) return null;
  const byCombo = product.combinations.find(c =>
    c.combo && Object.keys(variants).every(k => c.combo[k] === variants[k])
  );
  if (byCombo) return byCombo;
  const vals = Object.values(variants).filter(v => v != null && v !== '');
  if (vals.length === 0) return product.combinations[0] ?? null;
  if (vals.length === 1) return product.combinations.find(c => c.name === vals[0]) ?? null;
  return product.combinations.find(c => c.name === vals.join(' / ')) ?? null;
}

function getUnitPrice(p, qty, variants) {
  if (!p) return null;
  if (p.priceType === 'tiered') {
    const tier = getTierForQty(p, qty);
    const comboId = resolveCombo(p, variants)?.id ?? null;
    const prices = tier?.prices ?? {};
    if (comboId && prices[comboId] !== undefined) return parseFloat(prices[comboId]) || null;
    const vals = Object.values(prices).map(v => parseFloat(v)).filter(v => v > 0);
    return vals.length ? Math.min(...vals) : null;
  }
  if (p.priceType === 'fixed') {
    const vp = p.variantPrices ?? {};
    const comboId = resolveCombo(p, variants)?.id ?? null;
    if (comboId && vp[comboId]) return parseFloat(vp[comboId]) || null;
    return parseFloat(p.price ?? p.flatPrice) || null;
  }
  return null;
}

function formatAddress(addr) {
  return [
    addr.house_number && addr.street ? `${addr.house_number} ${addr.street}` : '',
    addr.subdivision,
    addr.barangay ? `Brgy. ${addr.barangay}` : '',
    addr.city,
    addr.province,
    addr.zip,
  ].filter(Boolean).join(', ');
}

function CustomOrderInner() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const { addToCart } = useCart();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [selectedVariants, setSelectedVariants] = useState({});
  const [selectedOptions, setSelectedOptions] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [quantityInput, setQuantityInput] = useState('1');

  const [designMode, setDesignMode] = useState(null);
  // Up to MAX_DESIGN_FILES per line - a wedding order is commonly one design for the
  // ladies and one for the gents. Files are uploaded to us rather than shared through a
  // link: a customer-supplied link is something the owner has to click, which is exactly
  // how phishing and malware reach a business.
  // Each entry: { key, name, size, preview, url, uploading }
  const [designFiles, setDesignFiles] = useState([]);
  const [designNotes, setDesignNotes] = useState('');
  // Silence used to mean two different things on an upload - "print it as it is" and "I did not
  // notice this field" - and they arrived looking identical. Making it a choice costs the prepared
  // customer one click and turns the unprepared one's silence into something they actually said.
  const [printIntent, setPrintIntent] = useState(null);   // null | 'as_is' | 'notes'
  const fileInputRef = useRef(null);

  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [addressLoading, setAddressLoading] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState(null);
  const [eWalletPhone, setEWalletPhone] = useState('');
  const [showEWalletPhone, setShowEWalletPhone] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');
  const [placing, setPlacing] = useState(false);
  const [failedModal, setFailedModal] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [pendingVerifyId, setPendingVerifyId] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  // Read from the CMS, never hardcoded - the owner changes their page and this follows. The footer
  // has the URL baked in, which is why it would quietly point at the wrong place after a rename.
  const [shopFacebook, setShopFacebook] = useState(null);
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [storeSettings, setStoreSettings]     = useState(null);
  const [shippingFeeAmt, setShippingFeeAmt]   = useState(null);
  const [rush, setRush]                       = useState(false);
  const [agreedTerms, setAgreedTerms]         = useState(false);
  const [showTerms, setShowTerms]             = useState(false);
  const [termsScrolled, setTermsScrolled]     = useState(false);
  const [pendingMode, setPendingMode]         = useState(null);
  useLockBodyScroll(showTerms || !!pendingMode || failedModal || verifyingPayment);
  // Owner-controlled method availability (Homepage CMS → Payment Methods). Missing key = enabled.
  const [payEnabled, setPayEnabled]           = useState({});
  const [addingToCart, setAddingToCart]       = useState(false);
  const [addedToCart, setAddedToCart]         = useState(false);

  useEffect(() => {
    if (token === null) {
      window.dispatchEvent(new CustomEvent('pmp_open_auth', { detail: { type: 'login', returnPath: window.location.pathname } }));
      router.push(`/shop/products/${id}`);
    }
  }, [token, id, router]);
  useEffect(() => {
    fetch(`${API_URL}/api/storefront/content/payment_methods`)
      .then(r => r.json())
      .then(d => { if (d?.data?.enabled && typeof d.data.enabled === 'object') setPayEnabled(d.data.enabled); })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isCancelled = params.get('payment_cancelled') === '1';
    const pendingOrderId = sessionStorage.getItem('pending_payment_order_id');
    if (isCancelled) window.history.replaceState({}, '', window.location.pathname);
    if (pendingOrderId) {
      sessionStorage.removeItem('pending_payment_order_id');
      if (isCancelled) { setFailedModal(true); return; }
      setVerifyingPayment(true);
      setPendingVerifyId(pendingOrderId);
    } else if (isCancelled) {
      setFailedModal(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!pendingVerifyId || !token) return;
    let cancelled = false;
    let attempt = 0;
    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${pendingVerifyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }, 10000);
        const data = await res.json();
        const order = data.data ?? data;
        if (order.paymentStatus === 'paid') {
          if (!cancelled) { setVerifyingPayment(false); router.push('/shop/orders-history?submitted=paid'); }
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
  }, [pendingVerifyId, token, router]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchWithTimeout(`${API_URL}/api/products/${id}`, {}, 30000)
      .then(r => r.json())
      .then(data => {
        const p = data.data ?? data;
        if (!p.isCustom) { router.push(`/shop/products/${id}`); return; }
        setProduct(p);

        // Carry over what was already chosen on the product page; fall back to
        // the first option / MOQ when the page is opened directly.
        const moq = p.minOrderQty || 1;
        const qtyParam = parseInt(searchParams.get('qty'), 10);
        const startQty = Number.isFinite(qtyParam) && qtyParam >= moq ? qtyParam : moq;
        setQuantity(startQty);
        setQuantityInput(String(startQty));

        if (p.variantGroups?.length) {
          const initial = {};
          p.variantGroups.forEach(g => {
            if (!g.options?.length) return;
            const fromUrl = searchParams.get(`v_${g.id}`);
            const valid = g.options.map(optValue);
            initial[g.id] = fromUrl && valid.includes(fromUrl) ? fromUrl : valid[0];
          });
          setSelectedVariants(initial);
        }

        // Same treatment for the options, and read from the URL only - nothing is defaulted here
        // either. Arriving without a choice means the customer never made one, and the order page is
        // not the place to invent it.
        const optInit = {};
        optionGroupsOf(p).forEach((g, gi) => {
          const gk = groupKey(g, gi);
          const fromUrl = searchParams.get(`o_${gk}`);
          const valid = g.options.map((o, oi) => optionKey(o, oi));
          if (fromUrl && valid.includes(fromUrl)) optInit[gk] = fromUrl;
        });
        setSelectedOptions(optInit);
      })
      .catch(() => setLoadError('Product not found.'))
      .finally(() => setLoading(false));
  }, [id, router, searchParams]);

  useEffect(() => {
    fetch(`${API_URL}/api/public/settings`)
      .then(r => r.json())
      .then(d => setStoreSettings(d.data ?? d))
      .catch(() => {});
  }, []);

  // A shop can be set to Flat Rate or Courier Booked, and this page used to ignore that entirely -
  // charging a fabricated distance-based figure regardless. Mirrors the three-mode branch checkout
  // already has, so the two screens can no longer disagree about what shipping costs.
  const courierBooked = !storeSettings?.shippingMode || storeSettings.shippingMode === 'courier_booked';

  useEffect(() => {
    const addr = addresses.find(a => a.id === selectedAddressId) ?? null;

    if (courierBooked) { setShippingFeeAmt(null); return; }

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
    const {
      storeLat, storeLng,
      shippingBaseRate = 49, shippingPerKmRate = 6, shippingPerKmRateFar = 5, shippingTierKm = 5,
    } = storeSettings;
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${storeLng},${storeLat};${addr.lng},${addr.lat}?overview=false`
    )
      .then(r => r.json())
      .then(d => {
        const distM = d.routes?.[0]?.distance ?? null;
        if (distM !== null) {
          const distKm = distM / 1000;
          // Tiered like a real motorcycle courier fare (base + a steeper first-tier per-km rate,
          // then a lower one beyond) - see checkout/page.jsx for the same formula and why.
          const nearKm = Math.min(distKm, shippingTierKm);
          const farKm  = Math.max(0, distKm - shippingTierKm);
          const fee    = shippingBaseRate + shippingPerKmRate * nearKm + shippingPerKmRateFar * farKm;
          setShippingFeeAmt(Math.round(fee * 100) / 100);
        } else {
          setShippingFeeAmt(null);
        }
      })
      .catch(() => setShippingFeeAmt(null));
  }, [selectedAddressId, addresses, storeSettings, courierBooked]);

  useEffect(() => {
    if (!token) return;
    setAddressLoading(true);
    fetchWithTimeout(`${API_URL}/api/addresses`, { headers: { Authorization: `Bearer ${token}` } }, 30000)
      .then(r => r.json())
      .then(data => {
        const list = data.addresses || [];
        setAddresses(list);
        const def = list.find(a => a.is_default);
        setSelectedAddressId(def?.id ?? list[0]?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setAddressLoading(false));
  }, [token]);

  const moq = product?.minOrderQty || 1;
  // Inquiry (quotation) products have no computable price — they go through the quote flow
  // (request now, owner sends a quote, customer pays it later), never a direct ₱0 checkout.
  const isInquiry = (product?.priceType ?? product?.pricingMode) === 'inquiry';

  const optionGroups  = product ? optionGroupsOf(product) : [];
  const optionUnitAdd = product ? optionsUnitAdd(product, selectedOptions) : 0;
  const optionOrderAdd= product ? optionsOrderAdd(product, selectedOptions) : 0;
  const chosenOptions = product ? selectedOptionList(product, selectedOptions) : [];

  // Per piece, matching the PDP: the extra cut is extra work on every unit.
  const unitPrice = getUnitPrice(product, quantity, selectedVariants) + optionUnitAdd;
  const designFee = designMode === 'request' ? (product?.designFee ?? 0) : 0;
  // The per-order charge sits outside the multiplication - it is paid once however many are made,
  // so folding it into unitPrice would bill it per piece and folding it out of the total would
  // lose it entirely.
  const lineTotal = (unitPrice ?? 0) * quantity + optionOrderAdd;

  // Delivery speed (turnaround). Config is global (store owner); Rush costs more + is faster.
  const prodLeadDays = Number(storeSettings?.productionLeadDays ?? 3);
  const shipMinDays  = Number(storeSettings?.shippingDaysMin ?? 1);
  const shipMaxDays  = Number(storeSettings?.shippingDaysMax ?? 2);
  const rushEnabled  = !!(storeSettings?.rushEnabled ?? false);
  const rushLeadDays = Number(storeSettings?.rushLeadDays ?? 1);
  const rushFeeAmt   = Number(storeSettings?.rushFee ?? 0);
  const rushActive   = rush && rushEnabled;
  const rushCharge   = rushActive ? rushFeeAmt : 0;
  // Custom-order T&C - owner-editable via CMS; fall back to the built-in defaults if none set.
  // Show only the clauses for the chosen mode (+ 'both'); a clause with no mode counts as 'both'.
  const activeTermsMode = designMode || (isInquiry ? 'request' : 'both');
  const revFree = Number(storeSettings?.freeRevisions ?? 3);
  const revFee  = Number(storeSettings?.extraRevisionFee ?? 50);
  const revMax  = Number(storeSettings?.maxRevisions ?? 5);
  // Same merge as the Settings editor: a saved set wins, but a built-in clause the owner has never
  // seen is still shown. A fee the customer was never told about has no basis, and the revision charge
  // is exactly that kind of fee - better to over-disclose than to bill on a term nobody published.
  const rawTerms = (() => {
    const saved = storeSettings?.customOrderTerms?.length ? storeSettings.customOrderTerms : null;
    const base = saved
      ? [...saved, ...CUSTOM_ORDER_TERMS.filter(d =>
          !saved.some(t => (t.title || '').trim().toLowerCase() === d.title.trim().toLowerCase()))]
      : CUSTOM_ORDER_TERMS;
    return base.map(c => ({ ...c, body: renderTermsBody(c.body, storeSettings) }));
  })();
  const activeClauses = rawTerms.filter(t => !t.mode || t.mode === 'both' || t.mode === activeTermsMode);
  const terms = activeClauses.map(t => [t.title, t.body]);
  // The exact clauses for THIS mode - carried with the cart line as the acceptance snapshot/proof.
  const termsSnapshot = activeClauses.map(t => ({ title: t.title, body: t.body, mode: t.mode || 'both' }));
  const termsVersion = storeSettings?.termsVersion ?? 1;
  // "Get by" date = today + (production + shipping) business days, skipping Sundays.
  const addBizDays = (n) => { const d = new Date(); let added = 0; while (added < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) added += 1; } return d; };
  const fmtGetBy = (d) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  const getByRange = (lead) => {
    const a = fmtGetBy(addBizDays(lead + shipMinDays));
    const b = fmtGetBy(addBizDays(lead + shipMaxDays));
    return a === b ? a : `${a} - ${b}`;
  };

  // Rush is chosen at checkout now, so the product-page total never includes a rush fee.
  const grandTotal = lineTotal + designFee + (shippingFeeAmt ?? 0);
  const downpaymentRequired = product?.requiresDownpayment ?? false;
  const downpaymentPercent = product?.downpaymentPercent ?? 50;
  const amountDue = designMode === 'request'
    ? designFee
    : downpaymentRequired
      ? Math.round(grandTotal * downpaymentPercent / 100 * 100) / 100
      : grandTotal;
  const remainingBalance = designMode === 'request'
    ? Math.round((grandTotal - designFee) * 100) / 100
    : downpaymentRequired
      ? Math.round((grandTotal - amountDue) * 100) / 100
      : 0;
  const selectedAddress = addresses.find(a => a.id === selectedAddressId) ?? null;
  const combo = product ? resolveCombo(product, selectedVariants) : null;
  const baseVariantLabel = combo?.label ?? (Object.values(selectedVariants).join(', ') || null);
  // The option joins the label, so it travels with the order to the job order and the receipt
  // without a new field on any of them.
  const variantLabel = product ? withOptionSuffix(baseVariantLabel, product, selectedOptions) : baseVariantLabel;

  const uploading     = designFiles.some(f => f.uploading);
  const uploadedFiles = designFiles.filter(f => f.url);
  // The first uploaded file stays the line's designUrl so every existing order, admin
  // screen and production view keeps working unchanged.
  const designFileUrl = uploadedFiles[0]?.url ?? null;

  useEffect(() => () => {
    designFiles.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function removeDesignFile(key) {
    setDesignFiles(prev => {
      const gone = prev.find(f => f.key === key);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return prev.filter(f => f.key !== key);
    });
  }

  useEffect(() => {
    fetch(`${API_URL}/api/storefront/content/contact`)
      .then(r => r.json())
      .then(d => { if (d?.data?.facebook) setShopFacebook(d.data.facebook); })
      .catch(() => {});
  }, []);

  async function handleFilesSelect(fileList) {
    const picked = Array.from(fileList || []);
    if (!picked.length) return;

    const cap = designMode === 'request' ? MAX_REFERENCE_FILES : MAX_DESIGN_FILES;
    const room = cap - designFiles.length;
    if (room <= 0) { setSubmitError(`You can attach up to ${cap} files.`); return; }

    setSubmitError(null);
    const accepted = [];
    // References are looked at, not printed, so a 25 MB phone photo is 25 MB of nothing - shrink it
    // the way Messenger quietly does. Artwork is never touched: a design file has to reach the press
    // byte-identical, and re-encoding one would be silent damage to the thing being sold.
    const isReference = designMode === 'request';
    for (const original of picked.slice(0, room)) {
      if (!ACCEPTED_RE.test(original.name)) { setSubmitError(`${original.name} is not an accepted format.`); continue; }
      const file = isReference ? await compressImage(original) : original;
      // Checked after shrinking, so a big photo that compresses down is accepted rather than refused
      // over a size the customer never has to care about.
      if (file.size > 10 * 1024 * 1024) { setSubmitError(`${original.name} is over 10 MB.`); continue; }
      accepted.push(file);
    }
    if (picked.length > room) setSubmitError(`Only ${cap} files can be attached - the rest were skipped.`);
    if (!accepted.length) return;

    const entries = accepted.map(file => ({
      key: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      size: file.size,
      preview: file.type?.startsWith('image/') ? URL.createObjectURL(file) : null,
      url: null,
      uploading: true,
      file,
    }));
    setDesignFiles(prev => [...prev, ...entries]);

    for (const entry of entries) {
      try {
        const { url, name } = await uploadDesignFile(token, entry.file);
        setDesignFiles(prev => prev.map(f => f.key === entry.key
          ? { ...f, url, name: name ?? f.name, uploading: false, file: null }
          : f));
      } catch (err) {
        // The catch used to discard err and tell everyone to try again - the same sentence for a
        // file too large, a format refused, an expired session and a service that was down. Only
        // one of those is worth retrying, so the customer was being sent to repeat a failure.
        removeDesignFile(entry.key);
        const why = err?.message && !/^Failed to upload design file$/i.test(err.message)
          ? err.message
          : 'Please try again.';
        setSubmitError(`${entry.name}: ${why}`);
      }
    }
  }

  // Buying one thing should not cost three clicks. Skips the cart and hands the same
  // payload straight to checkout - the cart's own path, minus the detour.
  function handleBuyNow() {
    if (designMode === 'upload' && uploading) { setSubmitError('Your files are still uploading, please wait.'); return; }
    if (designMode === 'upload' && !designFileUrl) { setSubmitError('Upload your design first.'); return; }
    if (designMode === 'upload' && !uploadOk) { setSubmitError('Tell us how to print it, or choose "Print exactly as my file is".'); return; }
    if (designMode === 'request' && !briefOk) { setSubmitError('Tell us what you need before ordering.'); return; }
    if (!designMode) { setSubmitError('Choose how you want to provide your design.'); return; }
    setSubmitError(null);

    const thumb = (combo?.id && product.variantImageUrls?.[combo.id])
      || combo?.imageUrl || product.thumbnail || product.images?.[0] || null;

    const payload = {
      items: [{
        product: {
          _id:                 product._id ?? product.id,
          name:                product.name,
          thumbnail:           thumb,
          images:              thumb ? [thumb] : (product.images ?? []),
          minOrderQty:         product.minOrderQty ?? null,
          requiresDownpayment: product.requiresDownpayment ?? false,
          downpaymentPercent:  product.downpaymentPercent ?? null,
          allowCOD:            product.allowCOD ?? true,
        },
        variantId:           combo?.id ?? null,
        variantName:         variantLabel ?? null,
        qty:                 quantity,
        unitPrice:           unitPrice ?? 0,
        isCustom:            true,
        designUrl:           designFileUrl,
        designName:          uploadedFiles[0]?.name ?? null,
        designFiles:         uploadedFiles.map(f => ({ url: f.url, name: f.name })),
        designNotes:         designNotes.trim() || null,
        designMode,
        designRequested:     designMode === 'request',
        designFee:           designMode === 'request' ? (product.designFee ?? null) : null,
        requiresDownpayment: product.requiresDownpayment ?? false,
        downpaymentPercent:  product.downpaymentPercent ?? null,
        allowCOD:            product.allowCOD ?? true,
        // T&C acceptance carried with the line (accepted here for this mode's terms).
        termsVersion,
        termsSnapshot,
        termsAgreedAt:       new Date().toISOString(),
      }],
      notes: '',
      fromCart: false,
    };

    try {
      sessionStorage.setItem('checkout_payload', JSON.stringify(payload));
      router.push('/shop/checkout');
    } catch {
      setSubmitError('Could not open checkout. Please try again.');
    }
  }

  // Each design mode has its OWN terms (upload vs request differ), so the customer accepts the right
  // terms here when they pick a mode. That acceptance travels with the cart line to checkout - no
  // second prompt there. Switching modes re-consents to the new mode's terms.
  const applyMode = (mode) => {
    setDesignMode(mode);
    setAgreedTerms(false);
    setTermsScrolled(false);
    setShowTerms(true);
  };
  const handlePickMode = (mode) => {
    if (mode === designMode) return;
    if (designMode) { setPendingMode(mode); return; }
    applyMode(mode);
  };

  // A custom line can be ordered once its design intent is set: an uploaded design needs its file,
  // a requested design needs nothing yet (the shop draws it after checkout). Quote inquiries have
  // their own Submit button and never hit the cart.
  const briefOk = designNotes.trim().length >= 10;
  // Same ten-character floor as a design request: "ok" and "asap" clear any check that only
  // rejects an empty box, and neither tells a printer anything.
  const uploadOk = !!designFileUrl && (
    printIntent === 'as_is' || (printIntent === 'notes' && briefOk)
  );
  const canOrder = !isInquiry && (
    (designMode === 'request' && briefOk) ||
    (designMode === 'upload' && uploadOk)
  );

  // Puts the configured item - artwork and all - into the ordinary cart. From here it is a
  // normal line that happens to carry a design, which is what makes a mug and a totebag
  // shippable as one order instead of two.
  async function handleAddToCart() {
    if (designMode === 'upload' && uploading) { setSubmitError('Your files are still uploading, please wait.'); return; }
    if (designMode === 'upload' && !designFileUrl) { setSubmitError('Upload your design first.'); return; }
    if (designMode === 'upload' && !uploadOk) { setSubmitError('Tell us how to print it, or choose "Print exactly as my file is".'); return; }
    if (designMode === 'request' && !briefOk) { setSubmitError('Tell us what you need before ordering.'); return; }
    if (!designMode) { setSubmitError('Choose how you want to provide your design.'); return; }
    setAddingToCart(true);
    setSubmitError(null);
    try {
      await addToCart(
        {
          ...product,
          isCustom: true,
          // The configurator already resolved the real per-piece price from the tier and
          // the variant. addToCart only knows flatPrice/price, which are empty on a
          // tiered product - so the line landed in the cart at zero.
          flatPrice: unitPrice ?? 0,
          price: unitPrice ?? 0,
          thumbnail: (combo?.id && product.variantImageUrls?.[combo.id])
            || combo?.imageUrl
            || product.thumbnail || product.images?.[0] || null,
        },
        quantity,
        combo?.id ?? null,
        variantLabel ?? null,
        null,
        {
          url:   designFileUrl || null,
          name:  uploadedFiles[0]?.name || null,
          files: uploadedFiles.map(f => ({ url: f.url, name: f.name })),
          notes: designNotes.trim() || null,
          mode:  designMode,
          // Carry the T&C acceptance with the line (accepted here for this mode's terms).
          termsVersion,
          termsSnapshot,
          termsAgreedAt: new Date().toISOString(),
        },
      );
      setAddedToCart(true);
    } catch (err) {
      setSubmitError(err?.message || 'Could not add to cart. Please try again.');
    } finally {
      setAddingToCart(false);
    }
  }

  async function handleSubmit() {
    if (!designMode) { setSubmitError('Please choose how you want to provide your design.'); return; }
    if (designMode === 'upload' && !designFileUrl) {
      setSubmitError(uploading ? 'Design is still uploading, please wait.' : 'Please upload your design file.');
      return;
    }

    // Inquiry (quotation) products: submit a quote request only — no address, no payment.
    // The owner reviews it, sends a quote; the customer pays that quote later.
    if (isInquiry) {
      setSubmitError(null);
      setPlacing(true);
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/order-requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            productId: String(product._id ?? product.id),
            quantity,
            selectedVariants,
            designUrl: designMode === 'upload' ? designFileUrl : null,
            designNotes: designNotes.trim() || null,
            designType: designMode,
            isCustom: true,
          }),
        }, 20000);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to submit your request.');
        setRequestSubmitted(true);
      } catch (err) {
        setSubmitError(err.message || 'Something went wrong. Please try again.');
      } finally {
        setPlacing(false);
      }
      return;
    }

    if (!selectedAddress) {
      setSubmitError('Please select a delivery address.'); return;
    }
    // Request design no longer pays on this page - it submits an unpaid order and the design
    // fee (then the goods) is paid from the order detail modal. Only the (now unused) upload
    // path here would ever need a payment method.
    const needsPayment = designMode === 'upload' && downpaymentRequired;
    if (needsPayment && !paymentMethod) {
      setSubmitError('Please select a payment method.'); return;
    }
    if (needsPayment && paymentMethod === 'card') {
      const num = cardNumber.replace(/\s/g,'');
      if (num.length < 16) { setSubmitError('Enter a valid 16-digit card number.'); return; }
      if (!cardExpiry || cardExpiry.length < 4) { setSubmitError('Enter a valid expiry date (MM/YY).'); return; }
      if (cardCvc.length < 3) { setSubmitError('Enter a valid security code.'); return; }
      if (!cardName.trim()) { setSubmitError('Enter the name on your card.'); return; }
    }

    setSubmitError(null);
    setPlacing(true);

    try {
      const orderItem = {
        productId: String(product._id ?? product.id),
        variantId: combo?.id ?? null,
        variantName: variantLabel,
        qty: quantity,
        unitPrice: unitPrice ?? 0,
        isCustom: true,
        ...(designMode === 'upload'
          ? {
              designUrl: designFileUrl,
              designName: uploadedFiles[0]?.name ?? null,
              ...(uploadedFiles.length > 1
                ? { designFiles: uploadedFiles.map(f => ({ url: f.url, name: f.name })) }
                : {}),
            }
          : {}),
        ...(designMode === 'request'
          ? {
              designRequested: true,
              designFee,
              ...(uploadedFiles.length
                ? { designFiles: uploadedFiles.map(f => ({ url: f.url, name: f.name })) }
                : {}),
            }
          : {}),
        // True of BOTH modes: someone sending their own artwork still has instructions for it.
        designNotes: designNotes.trim() || null,
      };

      // "Submit for review" must never take money - that is the whole promise of the
      // button. It used to fall through to PayMongo whenever the product carried a
      // downpayment, so the customer was charged by the one path that said they would
      // not be. The downpayment is collected later, from My Orders, once approved.
      if (designMode === 'upload') {
        const deliveryAddress = {
          label: selectedAddress.label,
          house_number: selectedAddress.house_number,
          street: selectedAddress.street,
          subdivision: selectedAddress.subdivision,
          barangay: selectedAddress.barangay,
          city: selectedAddress.city,
          province: selectedAddress.province,
          zip: selectedAddress.zip,
          phone: selectedAddress.phone,
        };
        const res = await fetchWithTimeout(`${API_URL}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            items: [orderItem],
            deliveryAddress,
            shippingFee: shippingFeeAmt ?? 0,
            isRush: rushActive,
            agreedToTerms: agreedTerms,
            termsVersion,
            isCustomOrder: true,
            designType: 'upload',
            designNotes: designNotes.trim() || null,
          }),
        }, 20000);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to submit.');
        router.push('/shop/orders-history?submitted=upload');
        return;
      }

      const deliveryAddress = {
        label: selectedAddress.label,
        house_number: selectedAddress.house_number,
        street: selectedAddress.street,
        subdivision: selectedAddress.subdivision,
        barangay: selectedAddress.barangay,
        city: selectedAddress.city,
        province: selectedAddress.province,
        zip: selectedAddress.zip,
        phone: selectedAddress.phone,
      };

      // Request design: submit an UNPAID order (no payment here). The design fee is the first
      // payment, then the goods - both collected from the order detail modal. paymentMethod
      // 'online' (not cod) so the balance gate applies before delivery.
      if (designMode === 'request') {
        const res = await fetchWithTimeout(`${API_URL}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            items: [orderItem],
            deliveryAddress,
            shippingFee: shippingFeeAmt ?? 0,
            isRush: rushActive,
            agreedToTerms: agreedTerms,
            termsVersion,
            isCustomOrder: true,
            designType: 'request',
            paymentMethod: 'online',
          }),
        }, 20000);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to submit your request.');
        router.push('/shop/orders-history?submitted=request');
        return;
      }

      const commonFields = {
        items: [orderItem],
        deliveryAddress,
        shippingFee: shippingFeeAmt ?? 0,
        isRush: rushActive,
        agreedToTerms: agreedTerms,
        termsVersion,
        isCustomOrder: true,
        designType: designMode,
        ...(designMode === 'request'
          ? { isDesignFeeOnly: true }
          : downpaymentRequired ? { isDownpayment: true, downpaymentPercent } : {}),
      };

      if (paymentMethod === 'cod') {
        const res = await fetchWithTimeout(`${API_URL}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...commonFields, paymentMethod: 'cod' }),
        }, 20000);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to place order.');
        const orderId = data.data?._id ?? data.data?.id ?? data._id ?? data.id;
        router.push(`/shop/payment-success?id=${orderId}&method=cod`);
      } else {
        let paymentMethodId = null;
        if (paymentMethod === 'card') {
          const publicKey = process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY;
          const [expMonth, expYear] = cardExpiry.split('/');
          const pmRes = await fetch('https://api.paymongo.com/v1/payment_methods', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(publicKey+':')}` },
            body: JSON.stringify({ data: { attributes: { type: 'card', details: { card_number: cardNumber.replace(/\s/g,''), exp_month: parseInt(expMonth), exp_year: parseInt('20'+expYear), cvc: cardCvc }, billing: { name: cardName.trim(), email: '', phone: '' } } } }),
          });
          const pmData = await pmRes.json();
          if (!pmRes.ok) {
            const detail = pmData.errors?.[0]?.detail ?? '';
            if (detail.includes('card_number')) throw new Error('Card number is invalid.');
            if (detail.includes('exp_month')||detail.includes('exp_year')) throw new Error('Expiry date is invalid.');
            if (detail.includes('cvc')) throw new Error('Security code is invalid.');
            throw new Error('Invalid card details. Please check and try again.');
          }
          paymentMethodId = pmData.data.id;
        }
        const res = await fetchWithTimeout(`${API_URL}/api/payment/initiate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            ...commonFields,
            paymentType: paymentMethod,
            paymentMethodId,
            eWalletPhone: (['gcash','paymaya'].includes(paymentMethod) && eWalletPhone.trim()) ? `+63${eWalletPhone.trim()}` : null,
          }),
        }, 25000);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Payment initiation failed.');
        const { orderId, status, redirectUrl } = data.data ?? data;
        if (status === 'succeeded') {
          router.push(`/shop/payment-success?id=${orderId}&method=${paymentMethod}`);
        } else if (redirectUrl) {
          sessionStorage.setItem('pending_payment_order_id', orderId);
          window.location.href = redirectUrl;
        } else {
          throw new Error('No redirect URL returned. Please try again.');
        }
      }
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setPlacing(false);
    }
  }
  if (verifyingPayment) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: 'var(--dark2)', borderRadius: '18px', padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, border: '3px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
        <p style={{ color: 'var(--white)', fontWeight: 600, marginBottom: 6 }}>Verifying payment…</p>
        <p style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>Please wait, this may take a few seconds.</p>
      </div>
    </div>
  );

  if (loading) {
    const bar = (extra) => ({ background: 'var(--dark2)', borderRadius: 8, animation: 'pmPulse 1.4s ease-in-out infinite', ...extra });
    const card = { background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 };
    return (
      <div style={{ minHeight: '100vh', background: 'var(--dark1)', color: 'var(--white)', padding: '2rem 1rem 4rem', fontFamily: "'Outfit', sans-serif" }}>
        <style>{`@keyframes pmPulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={bar({ width: 120, height: 14 })} />
          <div style={bar({ width: 260, height: 30 })} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,340px)', gap: 16, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={card}>
                <div style={bar({ width: '40%', height: 14 })} />
                <div style={bar({ width: '70%', height: 22 })} />
                <div style={bar({ width: '55%', height: 16 })} />
              </div>
              <div style={{ ...card, flexDirection: 'row', gap: 12 }}>
                <div style={bar({ flex: 1, height: 96 })} />
                <div style={bar({ flex: 1, height: 96 })} />
              </div>
            </div>
            <div style={card}>
              <div style={bar({ width: '60%', height: 18 })} />
              <div style={bar({ height: 44 })} />
              <div style={bar({ height: 60 })} />
              <div style={bar({ height: 60 })} />
              <div style={bar({ width: '80%', height: 22 })} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (failedModal) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
      <div style={{ background: 'var(--dark2)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '18px', padding: '40px 32px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
        <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '2px solid var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
        <h2 style={{ color: 'var(--white)', fontWeight: 700, fontSize: '1.3rem', marginBottom: 8 }}>Payment Cancelled</h2>
        <p style={{ color: 'var(--gray)', fontSize: '0.9rem', marginBottom: 28, lineHeight: 1.6 }}>
          Your payment was not completed. Your order has been saved — you can try again below.
        </p>
        <button onClick={() => setFailedModal(false)}
          style={{ width: '100%', padding: '12px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 9, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
          Try Again
        </button>
      </div>
    </div>
  );
  
  if (requestSubmitted) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dark1)', padding: '20px', fontFamily: "'Outfit', sans-serif" }}>
      <div style={{ background: 'var(--dark2)', border: '1px solid rgba(212,168,67,0.25)', borderRadius: '18px', padding: '40px 32px', maxWidth: '420px', width: '100%', textAlign: 'center' }}>
        <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(212,168,67,0.1)', border: '2px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 style={{ color: 'var(--white)', fontWeight: 700, fontSize: '1.3rem', marginBottom: 8 }}>Quote request submitted</h2>
        <p style={{ color: 'var(--gray)', fontSize: '0.9rem', marginBottom: 28, lineHeight: 1.6 }}>
          We&apos;ve received your request for <strong style={{ color: 'var(--white)' }}>{product.name}</strong>. We&apos;ll review the details and send you a quote via chat — you only pay once you approve it.
        </p>
        <button onClick={() => router.push('/shop')}
          style={{ width: '100%', padding: '12px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 9, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
          Continue Shopping
        </button>
      </div>
    </div>
  );

  if (loadError || !product) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', background: 'var(--dark1)', color: 'var(--white)', fontFamily: "'Outfit', sans-serif" }}>
      <p style={{ color: 'var(--gray)' }}>{loadError ?? 'Product not found.'}</p>
      <Link href="/shop" style={{ color: 'var(--gold)', fontSize: '0.9rem' }}>← Back to Shop</Link>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--dark1)', color: 'var(--white)', padding: '2rem 1rem 4rem', fontFamily: "'Outfit', sans-serif" }}>
      {showTerms && (
        <div onClick={() => setShowTerms(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px', maxWidth: '560px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--white)' }}>Custom Order Terms</h3>
              <button onClick={() => setShowTerms(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', display: 'flex' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div
              ref={el => { if (el && el.scrollHeight - el.clientHeight < 24) setTermsScrolled(true); }}
              onScroll={e => { const el = e.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) setTermsScrolled(true); }}
              style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {terms.map(([title, body], i) => (
                <div key={i}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '2px' }}>{i + 1}. {title}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.55 }}>{body}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>{termsScrolled ? `Terms v${termsVersion}` : 'Scroll down to read all terms'}</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowTerms(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--gray)', fontSize: '0.85rem', cursor: 'pointer' }}>Close</button>
                <button onClick={() => { setAgreedTerms(true); setShowTerms(false); }} disabled={!termsScrolled}
                  style={{ padding: '8px 16px', background: 'var(--gold)', border: 'none', borderRadius: '8px', color: '#000', fontSize: '0.85rem', fontWeight: 700, cursor: termsScrolled ? 'pointer' : 'not-allowed', opacity: termsScrolled ? 1 : 0.5 }}>I Agree</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {pendingMode && (
        <div onClick={() => setPendingMode(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '14px', maxWidth: '380px', width: '100%', padding: '22px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800, color: 'var(--white)' }}>Switch design mode?</h3>
            <p style={{ margin: '0 0 18px', fontSize: '0.85rem', color: 'var(--gray)', lineHeight: 1.6 }}>
              You are switching to <strong style={{ color: 'var(--white)' }}>{pendingMode === 'upload' ? 'Upload a design' : 'Request a design'}</strong>. You&apos;ll need to review and accept the Custom Order Terms again.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setPendingMode(null)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.85rem', cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>Cancel</button>
              <button onClick={() => { const m = pendingMode; setPendingMode(null); applyMode(m); }} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: 'var(--gold)', color: '#000', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>Switch</button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .custom-order-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,340px); gap: 16px; align-items: start; }
        @media (max-width: 768px) { .custom-order-grid { grid-template-columns: 1fr; } .custom-order-sidebar { position: static !important; } }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Link href={`/shop/products/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--gray)', fontSize: '0.85rem', textDecoration: 'none', marginBottom: '1.5rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Product
        </Link>

        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.2rem' }}>{isInquiry ? 'Request a Quote' : 'Place Custom Order'}</h1>
        <p style={{ color: 'var(--gray)', fontSize: '0.875rem', marginBottom: '2rem' }}>{product.name}</p>

        <div className="custom-order-grid">

          {/* ── LEFT: FORM ─────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Step 1: Product Config */}
            <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.15rem' }}>
              <h2 style={{ fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.85rem' }}>Product details</h2>

              {/* The variant was already chosen on the product page, so it is confirmed
                  here rather than asked again. "Change" goes back to that picker. */}
              {product.variantGroups?.length > 0 && (
                <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {product.variantGroups.map((group, gi) => {
                    const chosen = group.options?.find(o => optValue(o) === selectedVariants[group.id]);
                    return (
                      <div key={group.id ?? group.name ?? gi} style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
                        <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', margin: 0, minWidth: '90px' }}>{group.name}</p>
                        <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--white)', margin: 0 }}>
                          {chosen ? optLabel(chosen) : '—'}
                        </p>
                      </div>
                    );
                  })}
                  {/* Confirmed here, chosen on the product page - the same treatment the variant
                      gets, because to the customer they were the same kind of decision. */}
                  {chosenOptions.map((o, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', margin: 0, minWidth: '90px' }}>{o.group}</p>
                      <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--white)', margin: 0 }}>
                        {o.label}
                        {o.priceAdd > 0 && (
                          <span style={{ fontWeight: 500, color: 'var(--gray)', fontSize: '0.8rem' }}>
                            {'  +' + fmt(o.priceAdd)}{o.priceMode === 'order' ? ' once' : ' / pc'}
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                  <Link
                    href={`/shop/products/${id}`}
                    style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--gold)', textDecoration: 'none' }}
                  >
                    Change variant
                  </Link>
                </div>
              )}

              <div>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: '0.5rem' }}>
                  Quantity
                  {moq > 1 && <span style={{ color: 'var(--gold)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'none', marginLeft: '6px' }}>Min. {moq} pcs</span>}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    onClick={() => { const n = Math.max(moq, quantity - 1); setQuantity(n); setQuantityInput(String(n)); }}
                    style={{ width: 36, height: 36, borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--white)', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>−</button>
                  <input type="text" value={quantityInput}
                    onChange={e => setQuantityInput(e.target.value)}
                    onBlur={() => { const n = Math.max(moq, parseInt(quantityInput) || moq); setQuantity(n); setQuantityInput(String(n)); }}
                    style={{ width: 64, textAlign: 'center', padding: '0.4rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--white)', fontSize: '0.95rem', fontFamily: "'Outfit', sans-serif" }} />
                  <button
                    onClick={() => { const n = quantity + 1; setQuantity(n); setQuantityInput(String(n)); }}
                    style={{ width: 36, height: 36, borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--white)', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
                  {unitPrice != null && (
                    <span style={{ marginLeft: '0.5rem', color: 'var(--gray)', fontSize: '0.85rem' }}>{fmt(unitPrice)} / pc</span>
                  )}
                </div>
              </div>
            </section>

            {/* Step 2: Design */}
            <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.15rem' }}>
              <h2 style={{ fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.85rem' }}>Your design</h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <button onClick={() => handlePickMode('upload')}
                  style={{ padding: '1.25rem', borderRadius: '10px', border: `1.5px solid ${designMode === 'upload' ? 'var(--gold)' : 'var(--border)'}`, background: designMode === 'upload' ? 'rgba(212,168,67,0.08)' : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', color: 'var(--white)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={designMode === 'upload' ? '#D4A843' : 'var(--gray)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', marginBottom: '0.6rem' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem', color: designMode === 'upload' ? 'var(--gold)' : 'var(--white)' }}>I have a design</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--gray)', margin: 0, lineHeight: 1.5 }}>
                    Your file is finished and ready to print as it is. We print exactly what you send.
                    <span style={{ display: 'block', color: '#166534', fontWeight: 700, marginTop: 4 }}>Free</span>
                  </p>
                </button>

                <button onClick={() => handlePickMode('request')}
                  style={{ padding: '1.25rem', borderRadius: '10px', border: `1.5px solid ${designMode === 'request' ? 'var(--gold)' : 'var(--border)'}`, background: designMode === 'request' ? 'rgba(212,168,67,0.08)' : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', color: 'var(--white)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={designMode === 'request' ? '#D4A843' : 'var(--gray)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', marginBottom: '0.6rem' }}>
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                  <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem', color: designMode === 'request' ? 'var(--gold)' : 'var(--white)' }}>Request a design</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--gray)', margin: 0, lineHeight: 1.5 }}>
                    You have photos, ideas or text and want us to make the artwork. We send you a
                    mockup to approve before anything is printed.
                    {product.designFee > 0 && !isInquiry && (
                      <span style={{ display: 'block', color: 'var(--gold)', fontWeight: 700, marginTop: 4 }}>
                        +{fmt(product.designFee)} - includes 3 revisions
                      </span>
                    )}
                  </p>
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: '1.1rem',
                padding: '9px 11px', borderRadius: 8, background: 'rgba(212,168,67,0.06)',
                border: '1px solid rgba(212,168,67,0.2)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2"
                  style={{ flexShrink: 0, marginTop: 2 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <span style={{ fontSize: '0.75rem', color: 'var(--gray)', lineHeight: 1.55 }}>
                  <strong style={{ color: 'var(--white)' }}>Not sure?</strong> Choose{' '}
                  <strong style={{ color: 'var(--white)' }}>I have a design</strong> and message us -
                  we will look at your file and tell you if it needs work.{' '}
                  <strong style={{ color: 'var(--white)' }}>The design fee is only charged if you agree to it.</strong>
                </span>
              </div>

              {/* One picker, both modes: the artwork on an upload, the references on a request. */}
              <input ref={fileInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.ai,.psd,.svg"
                style={{ display: 'none' }}
                onChange={e => { handleFilesSelect(e.target.files); e.target.value = ''; }} />

              {designMode === 'upload' && (
                <div>
                  {/* Offered before the upload box, not after - a template is only useful to
                      someone who has not drawn anything yet. */}
                  {product.designTemplates?.length > 0 && (
                    <div style={{ marginBottom: '0.85rem', padding: '0.75rem 0.9rem', background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: '10px' }}>
                      <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#60a5fa', margin: '0 0 0.15rem' }}>Start from our template</p>
                      <p style={{ fontSize: '0.73rem', color: 'var(--gray)', margin: '0 0 0.5rem', lineHeight: 1.5 }}>
                        Correct size, bleed and safe area already set up, so your artwork lands exactly where you expect.
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {product.designTemplates.map((t, i) => (
                          <a key={i} href={t.url} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 11px', borderRadius: '999px', border: '1px solid rgba(96,165,250,0.4)', color: '#60a5fa', fontSize: '0.73rem', fontWeight: 700, textDecoration: 'none' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            {t.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {designFiles.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      {designFiles.map(f => (
                        <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0.85rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '10px' }}>
                          {f.uploading ? (
                            <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <div style={{ width: 18, height: 18, border: '2px solid rgba(212,168,67,0.2)', borderTopColor: '#D4A843', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                            </div>
                          ) : f.preview ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={f.preview} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: '#fff' }} />
                          ) : (
                            <span style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, background: 'rgba(212,168,67,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                              </svg>
                            </span>
                          )}
                          <span style={{ fontSize: '0.82rem', flex: 1, minWidth: 0, color: 'var(--white)' }}>
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                            <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--gray)' }}>
                              {f.uploading ? 'Uploading...' : `${(f.size / 1024 / 1024).toFixed(2)} MB`}
                              {!f.uploading && !f.preview && ' - no preview for this format'}
                            </span>
                          </span>
                          <button onClick={() => removeDesignFile(f.key)}
                            style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {designFiles.length < MAX_DESIGN_FILES && (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(212,168,67,0.6)'; }}
                      onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                      onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)'; handleFilesSelect(e.dataTransfer.files); }}
                      style={{ border: '2px dashed var(--border)', borderRadius: '10px', padding: designFiles.length ? '1.25rem 1rem' : '2.5rem 1rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                      <svg width={designFiles.length ? 24 : 36} height={designFiles.length ? 24 : 36} viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 0.6rem' }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                        {designFiles.length ? 'Add another file' : 'Click or drag to upload'}
                      </p>
                      {/* EPS was advertised here but rejected by the server - one accepted list now. */}
                      <p style={{ fontSize: '0.75rem', color: 'var(--gray)', margin: 0 }}>
                        JPG, PNG, WEBP, PDF, AI, PSD, SVG · Max 10 MB each · {designFiles.length}/{MAX_DESIGN_FILES} files
                      </p>
                    </div>
                  )}

                  {product.designFormats?.length > 0 && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.6rem' }}>
                      Accepted: {product.designFormats.map(f => f.name || f).join(', ')}
                    </p>
                  )}
                </div>
              )}

              {/* Instructions for an UPLOADED design - placement, colour, sizing. The printer
                  needs these as much as the file itself; without a field they had to guess. */}
              {designMode === 'upload' && (
                <div style={{ marginTop: '0.85rem' }}>
                  {/* A choice rather than a required box. A mandatory textarea gets "ok" and "print
                      po" typed into it to reach the button - a toll, not an instruction. Two radios
                      cost the prepared customer one click, and make the unprepared one decide
                      something instead of skipping a field they never read. Either way the order
                      carries a sentence the printer can act on. */}
                  <p style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.6rem' }}>
                    How should we print this?{' '}
                    <span style={{ color: 'var(--gray)', opacity: 0.85 }}>
                      This is the only instruction the printer gets.
                    </span>
                  </p>

                  {[
                    { key: 'as_is', title: 'Print exactly as my file is',
                      sub: 'No changes, no repositioning, no resizing.' },
                    { key: 'notes', title: 'I have specific instructions',
                      sub: 'Placement, orientation, margins, exact colours.' },
                  ].map(opt => {
                    const on = printIntent === opt.key;
                    return (
                      <button key={opt.key} type="button"
                        onClick={() => {
                          setPrintIntent(opt.key);
                          // Leaving the canned sentence behind when they switch would make them
                          // delete it before they could type; clearing anything they wrote would
                          // throw away their work. Only ever clear our own text.
                          if (opt.key === 'as_is') setDesignNotes(AS_IS_NOTE);
                          else if (designNotes === AS_IS_NOTE) setDesignNotes('');
                        }}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', width: '100%',
                          textAlign: 'left', padding: '0.7rem 0.8rem', marginBottom: '0.5rem',
                          borderRadius: '10px', cursor: 'pointer',
                          border: on ? '1px solid var(--gold)' : '1px solid var(--border)',
                          background: on ? 'rgba(212,168,67,0.08)' : 'rgba(255,255,255,0.03)' }}>
                        <span style={{ width: 15, height: 15, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                          border: on ? '5px solid var(--gold)' : '1.5px solid var(--gray)',
                          background: 'transparent', boxSizing: 'border-box' }} />
                        <span>
                          <span style={{ display: 'block', fontSize: '0.83rem', fontWeight: 600,
                            color: on ? 'var(--gold)' : 'var(--white)' }}>{opt.title}</span>
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray)', marginTop: 1 }}>
                            {opt.sub}
                          </span>
                        </span>
                      </button>
                    );
                  })}

                  {printIntent === 'notes' && (
                    <textarea value={designNotes} onChange={e => setDesignNotes(e.target.value)}
                      placeholder="E.g. Portrait, centered on the front, keep a 1cm margin, match the red exactly."
                      rows={3}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--white)', fontSize: '0.85rem', fontFamily: "'Outfit', sans-serif", resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
                  )}
                </div>
              )}

              {designMode === 'request' && (
                <div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>
                    Describe what you need <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>
                    <span style={{ display: 'block', color: 'var(--gray)', opacity: 0.85, marginTop: 2 }}>
                      There is nothing to print until we draw it, so we need somewhere to start.
                      Our designer will follow up in chat.
                    </span>
                  </p>
                  <textarea value={designNotes} onChange={e => setDesignNotes(e.target.value)}
                    placeholder="E.g. Company logo in blue and white, add 'ABC Corp' in bold. Minimalist style."
                    rows={4}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--white)', fontSize: '0.85rem', fontFamily: "'Outfit', sans-serif", resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />

                  <div style={{ marginTop: '0.85rem' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>
                      Reference photos (optional)
                      <span style={{ display: 'block', color: 'var(--gray)', opacity: 0.85, marginTop: 2 }}>
                        Photos, a logo, a screenshot of something you like. We design from these -
                        they are not printed as they are.
                      </span>
                    </p>
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px',
                        borderRadius: 8, border: '1px solid var(--border)', background: 'transparent',
                        color: 'var(--white)', fontSize: '0.8rem', fontWeight: 600,
                        cursor: uploading ? 'wait' : 'pointer' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      {uploading ? 'Uploading...' : uploadedFiles.length ? 'Add more' : 'Attach references'}
                    </button>

                    {uploadedFiles.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        {uploadedFiles.map((f, i) => (
                          <div key={i} style={{ position: 'relative', width: 62, height: 62, borderRadius: 8,
                            overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--dark2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {/\.(jpe?g|png|webp|gif)$/i.test(f.url)
                              ? <img src={f.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--gold)' }}>
                                  {(f.name || 'FILE').split('.').pop().toUpperCase().slice(0, 4)}
                                </span>}
                            <button type="button" onClick={() => removeDesignFile(f.key)}
                              style={{ position: 'absolute', top: 2, right: 2, width: 17, height: 17,
                                borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.65)',
                                color: '#fff', fontSize: 11, lineHeight: 1, cursor: 'pointer', padding: 0 }}>
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Step 3: Delivery — shown for both upload and request */}
            {(designMode === 'upload' || designMode === 'request') && !isInquiry && <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.15rem' }}>
              <h2 style={{ fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.85rem' }}>Delivery address</h2>
              {addressLoading ? (
                <p style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>Loading addresses...</p>
              ) : addresses.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.25rem 0' }}>
                  <p style={{ color: 'var(--gray)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>No saved addresses.</p>
                  <Link href="/shop/profile" style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '0.85rem' }}>+ Add an address in Profile</Link>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {addresses.map(addr => {
                    const active = addr.id === selectedAddressId;
                    return (
                      <div key={addr.id} onClick={() => setSelectedAddressId(addr.id)}
                        style={{ padding: '0.875rem 1rem', borderRadius: '10px', border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`, background: active ? 'rgba(212,168,67,0.06)' : 'transparent', cursor: 'pointer', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', transition: 'all 0.12s' }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${active ? 'var(--gold)' : 'var(--gray)'}`, flexShrink: 0, marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {active && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} />}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '2px' }}>
                            {addr.label || 'Home'}
                            {addr.is_default && (
                              <span style={{ marginLeft: '6px', fontSize: '0.65rem', background: 'rgba(212,168,67,0.15)', color: 'var(--gold)', padding: '1px 6px', borderRadius: '999px', fontWeight: 700 }}>Default</span>
                            )}
                          </p>
                          <p style={{ fontSize: '0.8rem', color: 'var(--gray)', margin: 0 }}>{formatAddress(addr)}</p>
                          {addr.phone && <p style={{ fontSize: '0.78rem', color: 'var(--gray)', margin: '2px 0 0' }}>{addr.phone}</p>}
                        </div>
                      </div>
                    );
                  })}
                  <Link href="/shop/profile" style={{ fontSize: '0.8rem', color: 'var(--gold)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '0.25rem', textDecoration: 'none' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Manage addresses
                  </Link>
                </div>
              )}
            </section>}

            {/* Step 4: Payment - never on this page any more. Request design submits an unpaid
                order and pays the design fee (then the goods) from the order detail modal;
                upload design goes through the cart. Kept only for the legacy inquiry branch. */}
            {false && <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.15rem' }}>
              <h2 style={{ fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.85rem' }}>Payment method</h2>

              <div style={{ padding: '0.75rem 1rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                {designMode === 'request'
                  ? <>Pay the <strong style={{ color: 'var(--gold)' }}>design fee of {fmt(designFee)}</strong> now. The remaining order balance of <strong style={{ color: 'var(--white)' }}>{fmt(remainingBalance)}</strong> will be collected after design approval.</>
                  : <>A <strong style={{ color: 'var(--gold)' }}>{downpaymentPercent}% downpayment of {fmt(amountDue)}</strong> is required to confirm your custom order. The remaining <strong style={{ color: 'var(--white)' }}>{fmt(remainingBalance)}</strong> will be collected upon completion.</>
                }
              </div>

              {[
                ...(designMode === 'upload' && downpaymentRequired && product?.allowCOD
                  ? [{ id: 'cod', label: 'Cash on Delivery', sub: `Pay ₱${amountDue.toLocaleString('en-PH', { minimumFractionDigits: 2 })} downpayment on delivery.`, accent: '#d4a843', accentBg: 'rgba(212,168,67,0.08)', logo: '/logos/cod.png', isCOD: true }]
                  : []),
                { id: 'gcash',    label: 'GCash',              sub: "Redirect to GCash to authorize.",   accent: '#0066FF', accentBg: 'rgba(0,102,255,0.07)',    logo: '/logos/Gcash-Logo-1024x1024.png' },
                { id: 'paymaya', label: 'Maya',               sub: "Redirect to Maya to authorize.",    accent: '#00B14F', accentBg: 'rgba(0,177,79,0.07)',     logo: '/logos/maya logo.png' },
                { id: 'card',    label: 'Credit / Debit Card', sub: 'Pay with Visa or Mastercard.',     accent: '#9C7BE8', accentBg: 'rgba(156,123,232,0.07)', logo: '/logos/credit-card.svg', filterImg: true },
              ].filter(opt => payEnabled[opt.id] !== false).map(opt => {
                const isSelected = paymentMethod === opt.id;
                const isEWallet = opt.id === 'gcash' || opt.id === 'paymaya';
                const showPanel = isEWallet && isSelected;
                return (
                  <div key={opt.id}>
                    <div onClick={() => { setPaymentMethod(opt.id); setEWalletPhone(''); setShowEWalletPhone(false); }}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem 1rem', borderRadius: '10px', cursor: 'pointer', border: `1px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.07)'}`, background: isSelected ? opt.accentBg : 'var(--dark1)', marginBottom: showPanel ? 0 : '0.625rem', transition: 'all 0.18s' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '10px', flexShrink: 0, background: isSelected ? opt.accentBg : 'rgba(255,255,255,0.04)', border: `1px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.06)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={opt.logo} alt={opt.label} style={{ width: '30px', height: '30px', objectFit: 'contain', ...(opt.filterImg ? { filter: 'brightness(0) invert(1)', opacity: isSelected ? 1 : 0.45 } : { borderRadius: '6px' }) }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.15rem' }}>{opt.label}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>{opt.sub}</div>
                      </div>
                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.2)'}`, background: isSelected ? opt.accent : 'transparent', transition: 'all 0.18s' }} />
                    </div>
                    {showPanel && (
                      <div style={{ marginTop: '4px', marginBottom: '0.625rem', padding: '0.875rem 1rem', borderRadius: '10px', background: opt.id === 'gcash' ? 'rgba(0,102,255,0.04)' : 'rgba(0,177,79,0.04)', border: `1px solid ${opt.id === 'gcash' ? 'rgba(0,102,255,0.18)' : 'rgba(0,177,79,0.18)'}` }}>
                        {!showEWalletPhone ? (
                          <button type="button" onClick={() => setShowEWalletPhone(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', color: opt.id === 'gcash' ? '#0066FF' : '#00B14F', fontSize: '0.8rem', fontWeight: 600 }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                            Use a different {opt.id === 'gcash' ? 'GCash' : 'Maya'} number for billing reference
                          </button>
                        ) : (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: opt.id === 'gcash' ? '#0066FF' : '#00B14F', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{opt.id === 'gcash' ? 'GCash' : 'Maya'} number</span>
                              <button type="button" onClick={() => { setShowEWalletPhone(false); setEWalletPhone(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', fontSize: '0.75rem', padding: 0 }}>Cancel</button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', overflow: 'hidden' }} onFocusCapture={e => { e.currentTarget.style.borderColor = opt.id === 'gcash' ? '#0066FF' : '#00B14F'; }} onBlurCapture={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}>
                              <span style={{ padding: '0.65rem 0.75rem', fontSize: '0.9rem', fontFamily: 'monospace', color: 'var(--gray)', borderRight: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>+63</span>
                              <input type="tel" inputMode="numeric" placeholder="9XX XXX XXXX" maxLength={12} value={fmtPHPhone(eWalletPhone)} autoFocus onChange={e => setEWalletPhone(e.target.value.replace(/\D/g,'').slice(0,10))} style={{ flex: 1, background: 'transparent', border: 'none', padding: '0.65rem 0.875rem', color: 'var(--white)', fontSize: '0.9rem', outline: 'none', fontFamily: 'monospace' }} />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {paymentMethod === 'card' && (
                <div style={{ marginTop: '0.25rem', padding: '1.25rem', borderRadius: '12px', background: 'rgba(156,123,232,0.05)', border: '1px solid rgba(156,123,232,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(156,123,232,0.9)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Card Details</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="38" height="24" viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg"><rect width="38" height="24" rx="4" fill="#1A1F71"/><text x="19" y="17" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontStyle="italic" fontFamily="Arial,sans-serif">VISA</text></svg>
                      <svg width="38" height="24" viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg"><rect width="38" height="24" rx="4" fill="#252525"/><circle cx="14" cy="12" r="7.5" fill="#EB001B"/><circle cx="24" cy="12" r="7.5" fill="#F79E1B"/></svg>
                    </div>
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem' }}>Card number</label>
                    <div style={{ position: 'relative' }}>
                      <input type="text" inputMode="numeric" placeholder="1234 1234 1234 1234" value={cardNumber} onChange={e => setCardNumber(fmtCardNumber(e.target.value))} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.72rem 2.75rem 0.72rem 0.875rem', color: 'var(--white)', fontSize: '1rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', letterSpacing: '0.08em' }} onFocus={e => { e.target.style.borderColor='#9C7BE8'; }} onBlur={e => { e.target.style.borderColor='rgba(255,255,255,0.1)'; }} />
                      {cardBrand(cardNumber) && <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', fontWeight: 900, color: '#9C7BE8', background: 'rgba(156,123,232,0.12)', padding: '2px 6px', borderRadius: '4px' }}>{cardBrand(cardNumber)}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem' }}>Expiration date</label>
                      <input type="text" inputMode="numeric" placeholder="MM / YY" value={cardExpiry} onChange={e => setCardExpiry(fmtExpiry(e.target.value))} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.72rem 0.875rem', color: 'var(--white)', fontSize: '0.95rem', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} onFocus={e => { e.target.style.borderColor='#9C7BE8'; }} onBlur={e => { e.target.style.borderColor='rgba(255,255,255,0.1)'; }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem' }}>Security code</label>
                      <input type="text" inputMode="numeric" placeholder="CVC" maxLength={4} value={cardCvc} onChange={e => setCardCvc(e.target.value.replace(/\D/g,'').slice(0,4))} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.72rem 0.875rem', color: 'var(--white)', fontSize: '0.95rem', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} onFocus={e => { e.target.style.borderColor='#9C7BE8'; }} onBlur={e => { e.target.style.borderColor='rgba(255,255,255,0.1)'; }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem' }}>Name on card</label>
                    <input type="text" placeholder="Full name as on card" value={cardName} onChange={e => setCardName(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.72rem 0.875rem', color: 'var(--white)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} onFocus={e => { e.target.style.borderColor='#9C7BE8'; }} onBlur={e => { e.target.style.borderColor='rgba(255,255,255,0.1)'; }} />
                  </div>
                </div>
              )}
            </section>}

          </div>

          {/* ── RIGHT: STICKY SUMMARY ──────────────────────────── */}
          <div className="custom-order-sidebar" style={{ position: 'sticky', top: '5rem' }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.15rem' }}>

              <div style={{ display: 'flex', gap: '0.875rem', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                {(() => {
                  // Show the SELECTED variant's image (e.g. Ceramic White) when there is one, not the
                  // generic product thumbnail. Same resolution as the order item's thumbnail above.
                  const img = (combo?.id && product.variantImageUrls?.[combo.id]) || combo?.imageUrl || product.thumbnail || product.images?.[0] || null;
                  // A product with no picture returned null here, so the box disappeared and the
                  // name slid left - the card changed shape depending on whether someone had got
                  // round to uploading a photo. The frame is part of the layout; only its contents
                  // are conditional.
                  return img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={variantLabel ? `${product.name} - ${variantLabel}` : product.name}
                      style={{ width: 56, height: 56, borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: '8px', flexShrink: 0, background: '#f1f3f5',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <NoImage size={24} />
                    </div>
                  );
                })()}
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</p>
                  {variantLabel && <p style={{ fontSize: '0.78rem', color: 'var(--gray)', margin: '0 0 4px' }}>{variantLabel}</p>}
                  <div style={{ display: 'inline-flex', background: 'rgba(212,168,67,0.12)', color: 'var(--gold)', borderRadius: '999px', padding: '1px 8px', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Print to order</div>
                </div>
              </div>

              {isInquiry ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                  <span>{quantity} pc{quantity > 1 ? 's' : ''}</span>
                  <span style={{ color: 'var(--gold)' }}>Priced on quotation</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--gray)' }}>{fmt(unitPrice ?? 0)} × {quantity} pc{quantity > 1 ? 's' : ''}</span>
                    <span>{fmt(lineTotal)}</span>
                  </div>
                  {/* Shown on its own line rather than buried in the unit price, so the reader can
                      see it is not multiplied - the same reason the design fee has its own line. */}
                  {chosenOptions.filter(o => o.priceMode === 'order' && o.priceAdd > 0).map((o, i) => (
                    <div key={'oo' + i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--gray)' }}>{o.label} <span style={{ opacity: 0.7 }}>once</span></span>
                      <span style={{ color: 'var(--gold)' }}>+{fmt(o.priceAdd)}</span>
                    </div>
                  ))}
                  {designMode === 'request' && designFee > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--gray)' }}>Design fee</span>
                      <span style={{ color: 'var(--gold)' }}>+{fmt(designFee)}</span>
                    </div>
                  )}
                  {/* Delivery is now chosen ONCE for the whole order at CHECKOUT (pick your need-by
                      date there; a Rush option appears if it is earlier than standard). Here we only
                      show the standard estimate so the product page has no separate rush selector. */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--gray)' }}>Estimated delivery</span>
                      <span style={{ color: 'var(--white)', fontWeight: 600 }}>{getByRange(prodLeadDays)}</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--gray)', lineHeight: 1.5 }}>Need it sooner? Choose Standard or Rush at checkout.</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--gray)' }}>Shipping</span>
                    {shippingFeeAmt !== null
                      ? <span>{fmt(shippingFeeAmt)}</span>
                      : <span style={{ color: 'var(--gray)', fontStyle: 'italic', fontSize: '0.78rem' }}>Billed separately</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 700, paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                    <span>Total</span>
                    <span>{fmt(grandTotal)}</span>
                  </div>
                  {/* "Billed separately" above says shipping is missing; this says why and what to
                      expect, the same note checkout shows - so a customer who reads this on the
                      product page and checkout later is not told two different things. */}
                  {courierBooked && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '4px', padding: '10px 12px', background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '8px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
                        <rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                      </svg>
                      <span style={{ fontSize: '0.72rem', color: 'var(--gray-light)', lineHeight: 1.5 }}>
                        Total above excludes delivery. We book a third-party courier (Lalamove / Grab) to your
                        pinned location after your order is confirmed, then send you the exact fee in chat -
                        usually paid in cash to the rider or the seller. The fee can vary with the size of
                        your order.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {isInquiry && (
                <div style={{ padding: '0.875rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.78rem', color: 'var(--gray)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--gold)', display: 'block', marginBottom: '4px' }}>No payment now</strong>
                  We&apos;ll review your request and send you a quote in chat. You only pay once you approve the quote.
                </div>
              )}

              {designMode === 'upload' && !isInquiry && (
                <div style={{ padding: '0.875rem', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.78rem', color: 'var(--gray)', lineHeight: 1.6 }}>
                  <strong style={{ color: '#60a5fa', display: 'block', marginBottom: '4px' }}>We check your file before we print</strong>
                  Every file is reviewed before production. If the size, resolution or placement will not print well, we send you a mockup to approve, or ask for a replacement at no extra cost. If we still cannot print it and nothing has gone into production, we refund what you paid.
                </div>
              )}

              {designMode === 'request' && !isInquiry && (
                <div style={{ padding: '0.875rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '10px', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--gray)' }}>Design fee</span>
                    <span style={{ color: 'var(--gold)', fontWeight: 800 }}>{fmt(designFee)}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', lineHeight: 1.6 }}>
                    Charged once at checkout with the rest of your cart. The goods are paid after you approve the proof.
                  </div>
                </div>
              )}

              {designMode === 'request' && !isInquiry && (
                <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.75rem', color: 'var(--gray)', lineHeight: 1.6 }}>
                  Our designer will send a proof via chat within 24–48 hrs. Production starts once you approve.
                  {/* Said here, before the order exists, rather than only in the terms behind a link. A
                      customer who first meets the revision limit while asking for a fourth change reads
                      it as a penalty; one who was told up front reads it as the deal. Figures come from
                      shop settings, so the owner sets them once. */}
                  <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                    Includes <strong style={{ color: 'var(--white)' }}>{revFree}</strong> revision round{revFree === 1 ? '' : 's'}. Each further round costs{' '}
                    <strong style={{ color: 'var(--gold)' }}>₱{revFee.toLocaleString('en-PH')}</strong>, up to {revMax} rounds in total. The design fee is non-refundable.
                  </div>
                </div>
              )}

              {submitError && (
                <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.82rem', color: '#f87171', lineHeight: 1.5 }}>
                  {submitError}
                </div>
              )}

              {/* The checkbox and both buttons vanish under !canOrder, and disappearing silently
                  reads as broken rather than as "not yet". This names the one thing still missing,
                  in the same slot the controls will occupy once it is supplied. */}
              {!canOrder && !isInquiry && (
                <div style={{ padding: '0.75rem', marginBottom: '1rem', textAlign: 'center', fontSize: '0.82rem', color: 'var(--gray)', fontWeight: 600 }}>
                  {!designMode
                    ? 'Choose how you\u2019d like to provide your design to continue.'
                    : designMode === 'request'
                      ? 'Tell us what you need above - even a sentence is enough to start.'
                      : uploading
                        ? 'Uploading your file\u2026'
                        : !designFileUrl
                          ? 'Attach your design file to continue.'
                          : 'Tell us how to print it above.'}
                </div>
              )}

              {/* Offered as a way to ask, not a way to order. A custom order is where the questions
                  are - will my file work, can you do this size - and a customer who cannot ask
                  simply leaves. It sits below the real actions and says "not sure", because a link
                  that reads as an alternative checkout would move the agreement to a place the
                  order cannot see, which is the thing this system exists to stop. */}
              {shopFacebook && !addedToCart && (
                <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--gray)', margin: '0 0 0.85rem', lineHeight: 1.6 }}>
                  Not sure about your file or size?{' '}
                  <a href={shopFacebook} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--gold)', fontWeight: 700, textDecoration: 'underline' }}>
                    Message us on Facebook
                  </a>
                </p>
              )}

              {/* Custom-order T&C - accepted here (per mode) and carried with the line to checkout. */}
              {(designMode === 'upload' || designMode === 'request' || isInquiry) && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '0 0 0.85rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                  <input type="checkbox" checked={agreedTerms} onChange={e => setAgreedTerms(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--gold)', flexShrink: 0, marginTop: 1 }} />
                  <span>I have read and agree to the{' '}
                    <button type="button" onClick={() => { setTermsScrolled(false); setShowTerms(true); }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--gold)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit' }}>Custom Order Terms</button>.
                  </span>
                </label>
              )}

              {/* Add to cart - upload (with file) OR request. A custom line is just an ordinary cart
                  line carrying its own design, so a ready-made tumbler, an uploaded mug and a
                  requested tote can share one delivery fee and one checkout. The design fee (request)
                  and the downpayment are worked out at checkout from what the cart holds.
                  Both this and Buy it now disappear once the line is added - each custom line
                  carries its own uploaded artwork, so a second click here cannot mean "add one
                  more of the same" the way a plain catalog item would: it would need its own
                  file. A spent "Added to cart" button that stayed clickable was inviting a second,
                  silently duplicate line instead of saying what to do next. */}
              {canOrder && !addedToCart && (
                <button onClick={handleAddToCart} disabled={placing || addingToCart || !agreedTerms}
                  style={{ width: '100%', padding: '0.9rem', background: addingToCart ? 'rgba(212,168,67,0.55)' : 'var(--gold)',
                    color: '#000', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '0.95rem',
                    cursor: (addingToCart ? 'wait' : (!agreedTerms ? 'not-allowed' : 'pointer')), fontFamily: "'Outfit', sans-serif", opacity: !agreedTerms ? 0.5 : 1 }}>
                  {addingToCart ? 'Adding...' : 'Add to cart'}
                </button>
              )}

              {/* Buy it now - the single-item shortcut that lands in the SAME checkout as the cart.
                  Works for upload and request alike; the checkout charges each line by its own rule. */}
              {canOrder && !addedToCart && (
                <button onClick={handleBuyNow} disabled={placing || addingToCart || !agreedTerms}
                  style={{ width: '100%', padding: '0.85rem', marginTop: '0.6rem', background: 'transparent',
                    color: 'var(--gold)', border: '1.5px solid var(--gold)', borderRadius: '10px', fontWeight: 800,
                    fontSize: '0.9rem', cursor: !agreedTerms ? 'not-allowed' : 'pointer', fontFamily: "'Outfit', sans-serif", opacity: !agreedTerms ? 0.5 : 1 }}>
                  Buy it now
                </button>
              )}

              {/* Added: the line is done, so the two live choices are "check out now" or "keep
                  shopping" - not "press this again", which is what the old single button implied. */}
              {addedToCart && !isInquiry && (
                <div style={{ padding: '0.75rem', marginBottom: '0.6rem', background: 'transparent',
                  border: '1.5px solid var(--gold)', borderRadius: '10px', color: 'var(--gold)',
                  fontWeight: 700, fontSize: '0.88rem', textAlign: 'center' }}>
                  Added to cart
                </div>
              )}

              {addedToCart && !isInquiry && (
                <Link href="/shop/cart"
                  style={{ display: 'block', width: '100%', textAlign: 'center', padding: '0.9rem',
                    background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '10px',
                    fontWeight: 800, fontSize: '0.95rem', textDecoration: 'none' }}>
                  Go to cart and check out
                </Link>
              )}

              {addedToCart && !isInquiry && (
                <Link href="/shop"
                  style={{ display: 'block', width: '100%', textAlign: 'center', padding: '0.85rem', marginTop: '0.6rem',
                    background: 'transparent', color: 'var(--gold)', border: '1.5px solid var(--gold)', borderRadius: '10px',
                    fontWeight: 800, fontSize: '0.9rem', textDecoration: 'none' }}>
                  Continue shopping
                </Link>
              )}

              {/* One action only. A second button offering "review first" made the customer
                  choose between two things they cannot tell apart, and every priced product
                  goes through the cart anyway. The artwork check still happens - after
                  payment, before production - which is what Vistaprint and Printful do.
                  Quote requests keep their own button because they have no price to pay. */}
              {isInquiry && (
                <button onClick={handleSubmit} disabled={placing || !agreedTerms}
                  style={{ width: '100%', padding: isInquiry ? '0.9rem' : '0.75rem', marginTop: isInquiry ? 0 : '0.6rem',
                    background: isInquiry ? (placing ? 'rgba(212,168,67,0.55)' : 'var(--gold)') : 'transparent',
                    color: isInquiry ? '#000' : 'var(--gray)',
                    border: isInquiry ? 'none' : '1px solid var(--border)',
                    borderRadius: '10px', fontWeight: isInquiry ? 800 : 600, fontSize: isInquiry ? '0.95rem' : '0.82rem',
                    cursor: placing ? 'wait' : (!agreedTerms ? 'not-allowed' : 'pointer'), fontFamily: "'Outfit', sans-serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: !agreedTerms ? 0.5 : 1 }}>
                  {placing ? (
                    <>
                      <div style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      Submitting...
                    </>
                  ) : isInquiry ? 'Submit Quote Request' : 'Not sure about your file? Submit it for review first'}
                </button>
              )}

              <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--gray)', marginTop: '0.75rem', lineHeight: 1.5 }}>
                {isInquiry
                  ? 'No charge now - we\'ll send your quote after review.'
                  : 'Add more items to your cart before checking out. Delivery and design are charged once per order.'}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function CustomOrderPage() {
  return (
    <Suspense>
      <CustomOrderInner />
    </Suspense>
  );
}
