'use client';

/**
 * HOMEPAGE CMS — landing page by section.
 * Hero = TWO lists (Taglines + Hero Images), reusing the banners collection via a
 * `heroRole` discriminator. The live hero pairs tagline[i%T] + image[i%I].
 * Shop promo strips live in the separate Banners module.
 */

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import {
  getBanners, createBanner as apiCreate, updateBanner as apiUpdate,
  deleteBanner as apiDelete, publishBanner as apiPublish, unpublishBanner as apiUnpublish,
  uploadBannerImage,
} from '@/lib/bannerUtils';
import ErrorBoundary from '@/components/ErrorBoundary';
import HeroImagePositioner from '@/components/cms/HeroImagePositioner';

const ACCENTS = ['gold', 'red', 'white'];
const accentBg = (c) => (c === 'gold' ? 'var(--gold)' : c === 'red' ? '#dc2626' : 'var(--dark2)');
// titleParts = ordered colored segments. Falls back to legacy headline+accent1+accent2 for old taglines.
const partsOf = (t) => {
  if (Array.isArray(t?.titleParts) && t.titleParts.length) return t.titleParts;
  const arr = [];
  if (t?.headline) arr.push({ text: t.headline, color: 'white', newLine: false });
  if (t?.headlineAccent) arr.push({ text: t.headlineAccent, color: t.headlineAccentColor || 'gold', newLine: !!t.headlineBreak1 });
  if (t?.headlineAccent2) arr.push({ text: t.headlineAccent2, color: t.headlineAccent2Color || 'gold', newLine: !!t.headlineBreak2 });
  return arr.length ? arr : [{ text: '', color: 'white', newLine: false }];
};
const partColorStyle = (c) => ({ color: c === 'gold' ? 'var(--gold)' : c === 'red' ? '#dc2626' : c === 'white' || !c ? 'var(--dark2)' : c });
// Perceived luminance (0..1) of a #rrggbb color; null if not a hex. Used to flag colors too dark for the dark hero.
const hexLum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null; const n = parseInt(m[1], 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const lowContrast = (color) => { if (!color || ACCENTS.includes(color)) return false; const l = hexLum(color); return l !== null && l < 0.32; };
const bid = (b) => b._id || b.id;
const isLanding = (b) => { const s = b.showOn || 'both'; return s === 'landing' || s === 'both'; };

// ── Seed data (mirrors the hardcoded landing hero) ──
const SEED_TAGLINES = [
  { name: 'Print What Represents You', tag: 'Premium Custom Printing', headline: 'Print What', headlineAccent: 'Represents', headlineAccentColor: 'red', headlineAccent2: 'You', headlineAccent2Color: 'gold', subtext: "High-quality personalized printing for t-shirts, mugs, souvenirs, and more. Upload your design and we'll make it real.", ctaLabel: 'Browse Products', ctaLink: '/shop', cta2Label: 'How It Works', cta2Link: '#how-it-works' },
  { name: 'Ready in 24 Hours', tag: 'Fast Turnaround', headline: 'Ready in', headlineAccent: '24 Hours', headlineAccentColor: 'gold', headlineAccent2: '', headlineAccent2Color: 'gold', subtext: 'Most orders are printed and ready within a day. Rush orders available for urgent needs.', ctaLabel: 'View Services', ctaLink: '#services', cta2Label: 'Get a Quote', cta2Link: '/shop' },
  { name: 'Big Orders, Better Prices', tag: 'Bulk Orders Welcome', headline: 'Big Orders,', headlineAccent: 'Better Prices', headlineAccentColor: 'gold', headlineAccent2: '', headlineAccent2Color: 'gold', subtext: 'The more you order, the more you save. Check our full pricelist for bulk pricing breakdowns.', ctaLabel: 'View Pricing', ctaLink: '#pricing', cta2Label: 'Register Free', cta2Link: '#' },
];
const SEED_IMAGES = [
  ['T-Shirt Printing', '/products/Tshit_printing.jpg', 'center center'],
  ['DTF Printing', '/products/DTF.jpg', 'center center'],
  ['Custom Mugs', '/products/mugs.jpg', 'center center'],
  ['Button Pins & Badges', '/products/ButtonPins.jpg', 'center center'],
  ['Canvas Totebag', '/products/ecobags.jpg', 'center 70%'],
  ['Mousepad', '/products/MousePad.jpg', 'center center'],
  ['Ref Magnet', '/products/RefMagnet.jpg', 'center center'],
  ['Souvenirs & Gift Items', '/products/Souvenirs.jpg', 'center 65%'],
  ['Stickers & Labels', '/products/Stickers.jpg', 'center center'],
  ['Magnetic Bookmark', '/products/Bookmarks.jpg', 'center center'],
  ['Ballpens', '/products/Ballpens.jpg', 'center 30%'],
  ['Caps', '/products/Caps.jpg', 'center 60%'],
];

// Mirrors the landing's hardcoded pricing — owner starts from these, then edits.
const DEFAULT_PRICING = [
  { category: 'T-Shirt Printing', startingAt: '₱300', note: 'Final cost depends on quantity, design, material & panel print.' },
  { category: 'DTF Printing', startingAt: '₱250', note: 'Per meter. Final cost depends on quantity.' },
  { category: 'Mugs (11oz)', startingAt: '₱50', note: 'Ceramic White, Inner Color & Magic Mug variants.' },
  { category: 'Button Badges (2.25")', startingAt: '₱10', note: 'Badge/Button Pin, Magnet Badge & Keychain Badge.' },
  { category: 'Canvas Totebag', startingAt: '₱70', note: 'Plain & w/ Zipper+Pocket. Small, Medium, Large.' },
  { category: 'Ref Magnet', startingAt: '₱15', note: 'Maximum size 3".' },
  { category: 'Magnetic Bookmark', startingAt: '₱15', note: 'Maximum size 2.5".' },
  { category: 'Stickers & Labels', startingAt: '₱25', note: 'Kisscut / Diecut. Vinyl, Specialty, Photopaper, Regular & Kraft.' },
];
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const DEFAULT_WHYUS = [
  { title: 'Affordable Pricing', desc: 'Premium prints at prices that make sense. No hidden fees, no overpricing.' },
  { title: 'Fast Turnaround', desc: 'Most orders ready within 24–48 hours. Rush orders? We can make it work.' },
  { title: 'Design Assistance', desc: 'No designer? No problem. Request a design and our team will create it for you.' },
  { title: 'Approval Before Print', desc: 'You see and approve the final design before we print — 100% satisfaction guaranteed.' },
];
const DEFAULT_HIW = [
  { title: 'Browse Products', desc: 'Explore our full catalogue of personalizable items — shirts, mugs, bags, stickers, and more.' },
  { title: 'Personalize It', desc: 'Add your name, message, or upload a design. We handle every detail to make it uniquely yours.' },
  { title: 'Place Your Order', desc: 'Review your item and check out. We confirm every order and send a proof before production.' },
  { title: 'Receive & Enjoy', desc: 'Your personalized item is crafted with care and delivered straight to your door.' },
];
const DEFAULT_CONTACT = { handle: '@personalizemeprints', hours1: 'Mon - Sat: 9:00 AM - 6:00 PM', hours2: 'Sunday: By Appointment', hoursNote: 'You can order any time. Orders placed on Sundays or holidays start production the next working day.', shopeeUrl: 'https://shopee.ph/personalizemeprints', shopeeText: 'Shopee: personalizemeprints', email: '', facebook: 'https://www.facebook.com/share/1Mks4kwnhZ/?mibextid=wwXIfr', instagram: 'https://www.instagram.com/personalizemeprints', tiktok: 'https://www.tiktok.com/@personalizemeprints' };
const PAY_METHODS = [
  { id: 'cod', label: 'Cash on Delivery', sub: 'Pay on delivery. May also be limited per-product and is off for downpayment orders.' },
  { id: 'gcash', label: 'GCash', sub: 'Automated via PayMongo.' },
  { id: 'paymaya', label: 'Maya', sub: 'Automated via PayMongo.' },
  { id: 'card', label: 'Credit / Debit Card', sub: 'Visa & Mastercard via PayMongo.' },
];
const DEFAULT_PAY_ENABLED = { cod: true, gcash: true, paymaya: true, card: true };

export default function HomepageCmsPage() {
  const { token } = useAuth();
  const fileRef = useRef(null);

  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [modal, setModal]     = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const [tagId, setTagId]   = useState(null);
  const [editTag, setEditTag] = useState(null);
  const [imgId, setImgId]   = useState(null);
  const [editImg, setEditImg] = useState(null);

  const taglines = items.filter(b => b.heroRole === 'tagline');
  const images   = items.filter(b => b.heroRole === 'image');
  const tagLive  = editTag?.status === 'live';
  const imgLive  = editImg?.status === 'live';

  const load = async () => {
    setLoading(true);
    try {
      const all = (await getBanners(token) || []).filter(isLanding);
      setItems(all);
      const t = all.find(b => b.heroRole === 'tagline'); if (t) { setTagId(bid(t)); setEditTag({ ...t }); }
      const i = all.find(b => b.heroRole === 'image');   if (i) { setImgId(bid(i)); setEditImg({ ...i }); }
    } catch (err) { setModal({ type: 'error', title: 'Load Failed', message: err.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (token) load(); }, [token]); // eslint-disable-line

  const selectTag = (id) => { const b = taglines.find(x => bid(x) === id); if (b) { setTagId(id); setEditTag({ ...b }); } };
  const selectImg = (id) => { const b = images.find(x => bid(x) === id); if (b) { setImgId(id); setEditImg({ ...b }); } };
  const setT = (k, v) => setEditTag(p => ({ ...p, [k]: v }));
  const setI = (k, v) => setEditImg(p => ({ ...p, [k]: v }));

  const create = async (role) => {
    setBusy(true);
    try {
      const base = { showOn: 'landing', heroRole: role, status: 'draft', isVisible: false, order: items.length };
      const created = await apiCreate(role === 'tagline' ? { ...base, name: 'New tagline', headlineAccentColor: 'gold', headlineAccent2Color: 'gold' } : { ...base, name: 'New image', imagePosition: 'center center', imageScale: 1 }, token);
      setItems(p => [...p, created]);
      if (role === 'tagline') { setTagId(bid(created)); setEditTag({ ...created }); } else { setImgId(bid(created)); setEditImg({ ...created }); }
    } catch (err) { setModal({ type: 'error', title: 'Create Failed', message: err.message }); }
    finally { setBusy(false); }
  };

  const save = async (which) => {
    const ed = which === 'tag' ? editTag : editImg;
    const id = which === 'tag' ? tagId : imgId;
    if (!ed || !id) return;
    setBusy(true);
    try {
      const payload = which === 'img'
        ? { ...ed,
            imageScale: ed.imageScale == null ? null : Math.max(1, ed.imageScale),
            imageScaleMobile: ed.imageScaleMobile == null ? null : Math.max(1, ed.imageScaleMobile) }
        : ed;
      const up = await apiUpdate(id, payload, token);
      setItems(p => p.map(b => bid(b) === id ? up : b));
      if (which === 'tag') setEditTag({ ...up }); else setEditImg({ ...up });
      setModal({ type: 'success', title: 'Saved', message: 'Changes saved.' }); setTimeout(() => setModal(null), 1200);
    } catch (err) { setModal({ type: 'error', title: 'Save Failed', message: err.message }); }
    finally { setBusy(false); }
  };

  const togglePub = async (which) => {
    const ed = which === 'tag' ? editTag : editImg;
    const id = which === 'tag' ? tagId : imgId;
    if (!ed || !id) return;
    setBusy(true);
    try {
      const up = ed.status === 'live' ? await apiUnpublish(id, token) : await apiPublish(id, token);
      setItems(p => p.map(b => bid(b) === id ? up : b));
      if (which === 'tag') setEditTag({ ...up }); else setEditImg({ ...up });
    } catch (err) { setModal({ type: 'error', title: 'Failed', message: err.message }); }
    finally { setBusy(false); }
  };

  const del = (which, id) => setModal({
    type: 'confirm', title: 'Delete', message: 'Delete this item? This cannot be undone.',
    onConfirm: async () => {
      setBusy(true);
      try {
        await apiDelete(id, token);
        const next = items.filter(b => bid(b) !== id); setItems(next);
        if (which === 'tag' && tagId === id) { const t = next.find(b => b.heroRole === 'tagline'); setTagId(t ? bid(t) : null); setEditTag(t ? { ...t } : null); }
        if (which === 'img' && imgId === id) { const i = next.find(b => b.heroRole === 'image'); setImgId(i ? bid(i) : null); setEditImg(i ? { ...i } : null); }
        setModal(null);
      } catch (err) { setModal({ type: 'error', title: 'Delete Failed', message: err.message }); }
      finally { setBusy(false); }
    },
  });

  const upload = async (file) => {
    if (!file || !editImg) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setModal({ type: 'error', title: 'Invalid file', message: 'PNG, JPEG, or WebP only.' }); return; }
    if (file.size > 5 * 1024 * 1024) { setModal({ type: 'error', title: 'Too large', message: 'Under 5MB.' }); return; }
    setBusy(true);
    try { const url = await uploadBannerImage(file, token); setI('image', url); }
    catch (err) { setModal({ type: 'error', title: 'Upload Failed', message: err.message }); }
    finally { setBusy(false); }
  };

  const seed = async () => {
    setSeeding(true);
    try {
      const created = [];
      for (let i = 0; i < SEED_TAGLINES.length; i++) created.push(await apiCreate({ ...SEED_TAGLINES[i], showOn: 'landing', heroRole: 'tagline', status: 'draft', isVisible: false, order: i }, token));
      for (let i = 0; i < SEED_IMAGES.length; i++) { const [name, image, imagePosition] = SEED_IMAGES[i]; created.push(await apiCreate({ name, image, imagePosition, imageScale: 1, showOn: 'landing', heroRole: 'image', status: 'draft', isVisible: false, order: i }, token)); }
      setItems(p => [...p, ...created]);
      const t = created.find(b => b.heroRole === 'tagline'); if (t) { setTagId(bid(t)); setEditTag({ ...t }); }
      const im = created.find(b => b.heroRole === 'image'); if (im) { setImgId(bid(im)); setEditImg({ ...im }); }
      setModal({ type: 'success', title: 'Imported', message: 'Your current hero (3 taglines + 12 images) was imported as drafts. Edit, then Publish to go live.' });
    } catch (err) { setModal({ type: 'error', title: 'Import Failed', message: err.message }); }
    finally { setSeeding(false); }
  };

  // ── Work Gallery (reuses banners with heroRole='gallery'; self-contained) ──
  const gallery = items.filter(b => b.heroRole === 'gallery');
  const galFileRef = useRef(null);

  const onGalleryFile = async (file) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setModal({ type: 'error', title: 'Invalid file', message: 'PNG, JPEG, or WebP only.' }); return; }
    if (file.size > 5 * 1024 * 1024) { setModal({ type: 'error', title: 'Too large', message: 'Under 5MB.' }); return; }
    setBusy(true);
    try {
      const url = await uploadBannerImage(file, token);
      const created = await apiCreate({ showOn: 'landing', heroRole: 'gallery', name: 'Gallery photo', image: url, status: 'draft', isVisible: false, order: items.length }, token);
      setItems(p => [...p, created]);
    } catch (err) { setModal({ type: 'error', title: 'Upload Failed', message: err.message }); }
    finally { setBusy(false); }
  };

  const toggleGalPub = async (b) => {
    setBusy(true);
    try { const up = b.status === 'live' ? await apiUnpublish(bid(b), token) : await apiPublish(bid(b), token); setItems(p => p.map(x => bid(x) === bid(b) ? up : x)); }
    catch (err) { setModal({ type: 'error', title: 'Failed', message: err.message }); }
    finally { setBusy(false); }
  };

  const delGalleryPhoto = (id) => setModal({
    type: 'confirm', title: 'Delete photo', message: 'Remove this gallery photo? This cannot be undone.',
    onConfirm: async () => {
      setBusy(true);
      try { await apiDelete(id, token); setItems(p => p.filter(b => bid(b) !== id)); setModal(null); }
      catch (err) { setModal({ type: 'error', title: 'Delete Failed', message: err.message }); }
      finally { setBusy(false); }
    },
  });

  // ── Pricing cards (CMS — site_content key 'pricing'; falls back to defaults) ──
  const [pricing, setPricing] = useState(null);
  useEffect(() => {
    fetch(`${API_URL}/api/storefront/content/pricing`)
      .then(r => r.json())
      .then(d => setPricing(Array.isArray(d?.data?.cards) ? d.data.cards : DEFAULT_PRICING))
      .catch(() => setPricing(DEFAULT_PRICING));
  }, []);
  const setPricingCard = (i, k, v) => setPricing(p => p.map((c, idx) => idx === i ? { ...c, [k]: v } : c));
  const addPricingCard = () => setPricing(p => [...(p || []), { category: '', startingAt: '', note: '' }]);
  const removePricingCard = (i) => setPricing(p => p.filter((_, idx) => idx !== i));
  const savePricing = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/content/pricing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: { cards: pricing } }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Save failed');
      setModal({ type: 'success', title: 'Saved', message: 'Pricing updated — live on the homepage.' }); setTimeout(() => setModal(null), 1400);
    } catch (err) { setModal({ type: 'error', title: 'Save Failed', message: err.message }); }
    finally { setBusy(false); }
  };

  // ── Why-Us / How-It-Works / Contact (CMS via site_content) ──
  const [whyus, setWhyus]     = useState(null);
  const [hiw, setHiw]         = useState(null);
  const [contact, setContact] = useState(null);
  const [payment, setPayment] = useState(null);
  useEffect(() => {
    const get = (key) => fetch(`${API_URL}/api/storefront/content/${key}`).then(r => r.json()).then(d => d?.data).catch(() => null);
    get('why_us').then(d => setWhyus(Array.isArray(d?.features) ? d.features : DEFAULT_WHYUS));
    get('how_it_works').then(d => setHiw(Array.isArray(d?.steps) ? d.steps : DEFAULT_HIW));
    get('contact').then(d => setContact(d && typeof d === 'object' && !Array.isArray(d) ? { ...DEFAULT_CONTACT, ...d } : DEFAULT_CONTACT));
    get('payment_methods').then(d => setPayment(d?.enabled && typeof d.enabled === 'object' ? { ...DEFAULT_PAY_ENABLED, ...d.enabled } : DEFAULT_PAY_ENABLED));
  }, []);
  const saveContent = async (key, data, msg) => {
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/content/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Save failed');
      setModal({ type: 'success', title: 'Saved', message: msg || 'Saved — live on the homepage.' }); setTimeout(() => setModal(null), 1400);
    } catch (err) { setModal({ type: 'error', title: 'Save Failed', message: err.message }); }
    finally { setBusy(false); }
  };
  const setRow = (setter, i, k, v) => setter(p => p.map((x, idx) => idx === i ? { ...x, [k]: v } : x));

  // styles
  const lbl = { display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' };
  const inp = { width: '100%', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.6rem 0.8rem', color: 'var(--white)', fontSize: '0.85rem', boxSizing: 'border-box' };
  const card = { background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem' };
  const cardTitle = { margin: '0 0 1.1rem', paddingBottom: '0.8rem', borderBottom: '1px solid var(--border)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
  const chip = (active, live) => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.75rem', borderRadius: 8, cursor: 'pointer', border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`, background: active ? 'rgba(212,168,67,0.1)' : 'var(--dark2)', color: 'var(--white)', fontSize: '0.78rem' });
  const pubBtn = (live) => ({ padding: '0.5rem 1.1rem', borderRadius: 8, border: live ? '1px solid var(--border)' : 'none', fontWeight: 700, fontSize: '0.8rem', cursor: busy ? 'not-allowed' : 'pointer', background: live ? 'transparent' : 'linear-gradient(135deg,var(--gold-light),var(--gold-dark))', color: live ? 'var(--gray-light)' : 'var(--black)' });
  const liveBadge = (s) => <span style={{ fontSize: '0.58rem', padding: '1px 6px', borderRadius: 999, textTransform: 'uppercase', background: s === 'live' ? 'rgba(212,168,67,0.2)' : 'var(--dark3)', color: s === 'live' ? 'var(--gold)' : 'var(--gray)' }}>{s === 'live' ? 'Live' : 'Draft'}</span>;

  if (loading) return <div style={{ padding: '2rem' }}><div style={{ height: 56, borderRadius: 8, background: 'var(--dark2)', animation: 'pulse 1.5s infinite' }} /></div>;

  const empty = taglines.length === 0 && images.length === 0;

  return (
    <ErrorBoundary>
      <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--gray)' }}>Hero = taglines that loop, paired with images that cycle through all of them. Shop strips are in <Link href="/dashboard/business/banners" style={{ color: 'var(--gold)' }}>Banners</Link>.</p>
        </div>

        {empty && (
          <div style={{ ...card, marginBottom: '1.5rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--gray-light)', margin: '0 0 1rem' }}>Start by importing your current hero (3 taglines + 12 product images) as editable drafts.</p>
            <button onClick={seed} disabled={seeding} style={{ ...pubBtn(false), padding: '0.65rem 1.5rem' }}>{seeding ? 'Importing…' : 'Import current hero'}</button>
          </div>
        )}

        {/* ── TAGLINES ── */}
        <div style={{ ...card, marginBottom: '1.5rem' }}>
          <h2 style={cardTitle}>Hero Taglines <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)' }}>looping text</span></h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: editTag ? '1.25rem' : 0 }}>
            {taglines.map((b, i) => (
              <button key={bid(b)} onClick={() => selectTag(bid(b))} style={chip(tagId === bid(b))}>
                <span>{b.name || `Tagline ${i + 1}`}</span>{liveBadge(b.status)}
              </button>
            ))}
            <button onClick={() => create('tagline')} disabled={busy} style={{ padding: '0.4rem 0.75rem', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.78rem' }}>+ Add tagline</button>
          </div>

          {editTag && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button onClick={() => del('tag', tagId)} style={{ marginRight: 'auto', padding: '0.5rem 0.9rem', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: '0.78rem', cursor: 'pointer' }}>Delete</button>
                <button onClick={() => save('tag')} disabled={busy} style={{ ...inp, width: 'auto', cursor: 'pointer', background: 'transparent', fontWeight: 600, opacity: 1 }}>Save</button>
                <button onClick={() => togglePub('tag')} disabled={busy} style={pubBtn(tagLive)}>{tagLive ? 'Unpublish' : 'Publish'}</button>
              </div>
              {tagLive && <div style={{ fontSize: '0.72rem', color: 'var(--gold)' }}>● Live — saving applies to the homepage immediately.</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }} className="hp-2col">
                <div><label style={lbl}>Name (internal)</label><input style={inp} value={editTag.name || ''} onChange={e => setT('name', e.target.value.slice(0, 50))} maxLength={50} /></div>
                <div><label style={lbl}>Tag pill</label><input style={inp} value={editTag.tag || ''} onChange={e => setT('tag', e.target.value.slice(0, 40))} maxLength={40} /></div>
              </div>
              {(() => {
                const parts = partsOf(editTag);
                const setParts = (next) => setT('titleParts', next.length ? next : [{ text: '', color: 'white', newLine: false }]);
                const setPart = (i, key, v) => setParts(parts.map((p, idx) => idx === i ? { ...p, [key]: v } : p));
                const dupIdx = parts.findIndex((p, i) => i > 0 && p.text && parts[i - 1].text === p.text && (parts[i - 1].color || 'white') === (p.color || 'white'));
                const darkParts = parts.map((p, i) => (p.text && lowContrast(p.color)) ? i + 1 : null).filter(Boolean);
                return (
                  <div>
                    <label style={lbl}>Title (colored parts)</label>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {parts.map((p, i) => { const col = p.color || 'white'; return (
                        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.6rem', background: 'var(--dark2)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input style={{ ...inp, flex: 1, minWidth: 130 }} placeholder={i === 0 ? 'First word(s)…' : 'Word(s)…'} value={p.text || ''} onChange={e => setPart(i, 'text', e.target.value.slice(0, 60))} maxLength={60} />
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {ACCENTS.map(c => <button key={c} type="button" onClick={() => setPart(i, 'color', c)} title={c} style={{ width: 26, height: 34, borderRadius: 6, border: `2px solid ${col === c ? 'var(--white)' : 'transparent'}`, background: accentBg(c), cursor: 'pointer' }} />)}
                            <label title="Custom color" style={{ width: 26, height: 34, borderRadius: 6, border: `2px solid ${ACCENTS.includes(col) ? 'transparent' : 'var(--white)'}`, background: ACCENTS.includes(col) ? 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' : col, cursor: 'pointer', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                              <input type="color" value={ACCENTS.includes(col) ? '#3b82f6' : col} onChange={e => setPart(i, 'color', e.target.value)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0, margin: 0 }} />
                            </label>
                          </div>
                          <label title="Start this part on a new line" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--gray)', cursor: i === 0 ? 'not-allowed' : 'pointer' }}>
                            <input type="checkbox" checked={!!p.newLine} disabled={i === 0} onChange={e => setPart(i, 'newLine', e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
                            New line
                          </label>
                          <button type="button" onClick={() => setParts(parts.filter((_, idx) => idx !== i))} disabled={parts.length === 1} title="Remove part" style={{ padding: '0.35rem 0.55rem', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: '0.75rem', cursor: parts.length === 1 ? 'not-allowed' : 'pointer', opacity: parts.length === 1 ? 0.4 : 1 }}>✕</button>
                        </div>
                      ); })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => setParts([...parts, { text: '', color: 'gold', newLine: false }])} style={{ padding: '0.45rem 0.8rem', borderRadius: 6, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--white)', fontSize: '0.78rem', cursor: 'pointer' }}>+ Add part</button>
                      <span style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>Each part is one color. White = normal text. Toggle ⏎ to start a new line. Same word twice in different colors = just two parts.</span>
                    </div>
                    {dupIdx > -1 && <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--gold)' }}>Note: parts {dupIdx} &amp; {dupIdx + 1} are the same word in the same color — fine if intentional, but you may have meant different colors.</div>}
                    {darkParts.length > 0 && <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#f59e0b' }}>Low contrast: part{darkParts.length > 1 ? 's' : ''} {darkParts.join(', ')} use a dark color that may be hard to read on the hero — pick a lighter shade.</div>}
                    <div style={{ marginTop: 10 }}>
                      <label style={lbl}>Preview</label>
                      <div style={{ background: 'linear-gradient(135deg,#0f0f0f,#1f1f1f)', borderRadius: 8, padding: '0.9rem 1rem', fontSize: '1.4rem', fontWeight: 800, lineHeight: 1.25 }}>
                        {parts.map((p, i) => <span key={i}>{p.newLine && i > 0 ? <br /> : (i > 0 ? ' ' : '')}<span style={partColorStyle(p.color)}>{p.text}</span></span>)}
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div><label style={lbl}>Subtext</label><textarea style={{ ...inp, minHeight: 64, resize: 'vertical' }} value={editTag.subtext || ''} onChange={e => setT('subtext', e.target.value.slice(0, 200))} maxLength={200} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }} className="hp-2col">
                <div><label style={lbl}>Button 1 text</label><input style={inp} value={editTag.ctaLabel || ''} onChange={e => setT('ctaLabel', e.target.value.slice(0, 30))} maxLength={30} /></div>
                <div><label style={lbl}>Button 1 link</label><input style={inp} value={editTag.ctaLink || ''} onChange={e => setT('ctaLink', e.target.value)} /></div>
                <div><label style={lbl}>Button 2 text</label><input style={inp} value={editTag.cta2Label || ''} onChange={e => setT('cta2Label', e.target.value.slice(0, 30))} maxLength={30} /></div>
                <div><label style={lbl}>Button 2 link</label><input style={inp} value={editTag.cta2Link || ''} onChange={e => setT('cta2Link', e.target.value)} /></div>
              </div>
            </div>
          )}
        </div>

        {/* ── HERO IMAGES ── */}
        <div style={{ ...card, marginBottom: '1.5rem' }}>
          <h2 style={cardTitle}>Hero Images <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)' }}>cycle through all</span></h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: editImg ? '1.25rem' : 0 }}>
            {images.map((b, i) => (
              <button key={bid(b)} onClick={() => selectImg(bid(b))} style={{ ...chip(imgId === bid(b)), padding: '4px 4px 4px 8px' }}>
                {b.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.image} alt="" style={{ width: 28, height: 20, objectFit: 'cover', borderRadius: 3 }} /> : null}
                <span>{b.name || `Image ${i + 1}`}</span>{liveBadge(b.status)}
              </button>
            ))}
            <button onClick={() => create('image')} disabled={busy} style={{ padding: '0.4rem 0.75rem', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.78rem' }}>+ Add image</button>
          </div>

          {editImg && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }} className="hp-2col">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => del('img', imgId)} style={{ marginRight: 'auto', padding: '0.5rem 0.9rem', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: '0.78rem', cursor: 'pointer' }}>Delete</button>
                  <button onClick={() => save('img')} disabled={busy} style={{ ...inp, width: 'auto', cursor: 'pointer', background: 'transparent', fontWeight: 600, opacity: 1 }}>Save</button>
                  <button onClick={() => togglePub('img')} disabled={busy} style={pubBtn(imgLive)}>{imgLive ? 'Unpublish' : 'Publish'}</button>
                </div>
                {imgLive && <div style={{ fontSize: '0.72rem', color: 'var(--gold)' }}>● Live — saving applies to the homepage immediately.</div>}
                <div><label style={lbl}>Label (internal)</label><input style={inp} value={editImg.name || ''} onChange={e => setI('name', e.target.value.slice(0, 50))} maxLength={50} /></div>
                <div>
                  <label style={lbl}>Image</label>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={e => upload(e.target.files[0])} />
                  <div onClick={() => fileRef.current?.click()} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files[0]); }}
                    style={{ aspectRatio: '16/7', borderRadius: 10, border: `2px dashed ${dragOver ? 'var(--gold)' : 'var(--border)'}`, background: 'var(--dark2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }}>
                    {editImg.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={editImg.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center center', background: 'var(--dark)' }} /> : <span style={{ color: 'var(--gray)', fontSize: '0.82rem' }}>Drop / click to upload</span>}
                  </div>
                </div>
              </div>
              <div>
                <label style={lbl}>Focus &amp; zoom (desktop + mobile)</label>
                <HeroImagePositioner
                  image={editImg.image}
                  value={editImg.imagePosition || 'center center'} scale={editImg.imageScale ?? 1}
                  onChange={p => setI('imagePosition', p)} onScaleChange={v => setI('imageScale', v)}
                  valueMobile={editImg.imagePositionMobile ?? null} scaleMobile={editImg.imageScaleMobile ?? null}
                  onChangeMobile={p => setI('imagePositionMobile', p)} onScaleMobileChange={v => setI('imageScaleMobile', v)}
                  fit={editImg.imageFit || 'cover'} onFitChange={v => setI('imageFit', v)}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── WORK GALLERY ── */}
        <div style={{ ...card, marginBottom: '1.5rem' }}>
          <h2 style={cardTitle}>Work Gallery <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)' }}>&ldquo;Our Prints&rdquo; on the homepage</span></h2>
          <p style={{ color: 'var(--gray)', fontSize: '0.82rem', margin: '0 0 1rem', lineHeight: 1.6 }}>Upload real photos of finished orders. Published photos appear in the &ldquo;Our Work&rdquo; section on the landing page.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px' }}>
            {gallery.map(b => (
              <div key={bid(b)} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: `1px solid ${b.status === 'live' ? 'var(--gold)' : 'var(--border)'}`, background: 'var(--dark2)' }}>
                <div style={{ aspectRatio: '1 / 1', background: 'var(--dark)' }}>
                  {b.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                </div>
                <div style={{ position: 'absolute', top: 6, left: 6 }}>{liveBadge(b.status)}</div>
                <div style={{ display: 'flex', gap: 6, padding: 8 }}>
                  <button onClick={() => toggleGalPub(b)} disabled={busy} style={{ flex: 1, padding: '5px', borderRadius: 6, border: 'none', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', background: b.status === 'live' ? 'var(--dark3)' : 'linear-gradient(135deg,var(--gold-light),var(--gold-dark))', color: b.status === 'live' ? 'var(--gray-light)' : 'var(--black)' }}>{b.status === 'live' ? 'Unpublish' : 'Publish'}</button>
                  <button onClick={() => delGalleryPhoto(bid(b))} disabled={busy} title="Delete" style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: '0.7rem', cursor: 'pointer' }}>✕</button>
                </div>
              </div>
            ))}
            <button onClick={() => galFileRef.current?.click()} disabled={busy} style={{ aspectRatio: '1 / 1', borderRadius: 10, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>+</span>Add photo
            </button>
          </div>
          <input ref={galFileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={e => { onGalleryFile(e.target.files[0]); e.target.value = ''; }} />
        </div>

        {/* ── PRICING ── */}
        <div style={{ ...card, marginBottom: '1.5rem' }}>
          <h2 style={cardTitle}>Pricing Cards <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)' }}>&ldquo;Our Price List&rdquo; on the homepage</span></h2>
          {pricing === null ? (
            <div style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>Loading…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pricing.map((c, i) => (
                <div key={i} className="hp-price-row" style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.6fr 2.2fr auto', gap: '8px', alignItems: 'center' }}>
                  <input style={inp} placeholder="Category (e.g. T-Shirt Printing)" value={c.category || ''} onChange={e => setPricingCard(i, 'category', e.target.value)} />
                  <input style={inp} placeholder="₱300" value={c.startingAt || ''} onChange={e => setPricingCard(i, 'startingAt', e.target.value)} />
                  <input style={inp} placeholder="Short note" value={c.note || ''} onChange={e => setPricingCard(i, 'note', e.target.value)} />
                  <button onClick={() => removePricingCard(i)} title="Remove" style={{ padding: '0.5rem 0.7rem', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                <button onClick={addPricingCard} style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.8rem' }}>+ Add card</button>
                <button onClick={savePricing} disabled={busy} style={{ ...pubBtn(false), marginLeft: 'auto' }}>{busy ? 'Saving…' : 'Save pricing'}</button>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--gray)', margin: 0 }}>Cards auto-link to the matching shop collection. Saving applies to the homepage immediately.</p>
            </div>
          )}
        </div>

        {/* ── WHY US ── */}
        <div style={{ ...card, marginBottom: '1.5rem' }}>
          <h2 style={cardTitle}>Why Choose Us <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)' }}>4 feature bullets</span></h2>
          {whyus === null ? <div style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>Loading…</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {whyus.map((f, i) => (
                <div key={i} className="hp-price-row" style={{ display: 'grid', gridTemplateColumns: '1fr 2.4fr', gap: '8px', alignItems: 'center' }}>
                  <input style={inp} placeholder="Title" value={f.title || ''} onChange={e => setRow(setWhyus, i, 'title', e.target.value)} />
                  <input style={inp} placeholder="Description" value={f.desc || ''} onChange={e => setRow(setWhyus, i, 'desc', e.target.value)} />
                </div>
              ))}
              <button onClick={() => saveContent('why_us', { features: whyus }, 'Why-Us updated — live on the homepage.')} disabled={busy} style={{ ...pubBtn(false), alignSelf: 'flex-end' }}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          )}
        </div>

        {/* ── HOW IT WORKS ── */}
        <div style={{ ...card, marginBottom: '1.5rem' }}>
          <h2 style={cardTitle}>How It Works <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)' }}>4 steps (icons fixed)</span></h2>
          {hiw === null ? <div style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>Loading…</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {hiw.map((s, i) => (
                <div key={i} className="hp-price-row" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 2.4fr', gap: '8px', alignItems: 'center' }}>
                  <span style={{ color: 'var(--gray)', fontSize: '0.8rem', fontWeight: 700 }}>{String(i + 1).padStart(2, '0')}</span>
                  <input style={inp} placeholder="Step title" value={s.title || ''} onChange={e => setRow(setHiw, i, 'title', e.target.value)} />
                  <input style={inp} placeholder="Step description" value={s.desc || ''} onChange={e => setRow(setHiw, i, 'desc', e.target.value)} />
                </div>
              ))}
              <button onClick={() => saveContent('how_it_works', { steps: hiw }, 'How-It-Works updated — live on the homepage.')} disabled={busy} style={{ ...pubBtn(false), alignSelf: 'flex-end' }}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          )}
        </div>

        {/* ── CONTACT ── */}
        <div style={{ ...card, marginBottom: '1.5rem' }}>
          <h2 style={cardTitle}>Contact Info</h2>
          {contact === null ? <div style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>Loading…</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }} className="hp-2col">
              <div><label style={lbl}>Social handle</label><input style={inp} value={contact.handle || ''} onChange={e => setContact(p => ({ ...p, handle: e.target.value }))} /></div>
              <div><label style={lbl}>Email</label><input style={inp} type="email" placeholder="you@yourshop.com" value={contact.email || ''} onChange={e => setContact(p => ({ ...p, email: e.target.value }))} /></div>
              <div><label style={lbl}>Facebook URL</label><input style={inp} placeholder="https://facebook.com/yourpage" value={contact.facebook || ''} onChange={e => setContact(p => ({ ...p, facebook: e.target.value }))} /></div>
              <div><label style={lbl}>Instagram URL</label><input style={inp} placeholder="https://instagram.com/yourpage" value={contact.instagram || ''} onChange={e => setContact(p => ({ ...p, instagram: e.target.value }))} /></div>
              <div><label style={lbl}>TikTok URL</label><input style={inp} placeholder="https://tiktok.com/@yourpage" value={contact.tiktok || ''} onChange={e => setContact(p => ({ ...p, tiktok: e.target.value }))} /></div>
              <div><label style={lbl}>Shopee link (URL)</label><input style={inp} value={contact.shopeeUrl || ''} onChange={e => setContact(p => ({ ...p, shopeeUrl: e.target.value }))} /></div>
              <div><label style={lbl}>Shopee label</label><input style={inp} value={contact.shopeeText || ''} onChange={e => setContact(p => ({ ...p, shopeeText: e.target.value }))} /></div>
              <div><label style={lbl}>Hours line 1</label><input style={inp} value={contact.hours1 || ''} onChange={e => setContact(p => ({ ...p, hours1: e.target.value }))} /></div>
              <div><label style={lbl}>Hours line 2</label><input style={inp} value={contact.hours2 || ''} onChange={e => setContact(p => ({ ...p, hours2: e.target.value }))} /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Hours note</label>
                <input style={inp} maxLength={200}
                  value={contact.hoursNote || ''}
                  onChange={e => setContact(p => ({ ...p, hoursNote: e.target.value }))}
                  placeholder="Orders placed on Sundays or holidays start production the next working day." />
                <div style={{ fontSize: '.72rem', color: 'var(--gray)', marginTop: '.3rem' }}>
                  Shown under Business Hours on the homepage and beside the delivery estimate at checkout. Ordering is never blocked by your hours - this line explains when the clock starts.
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1', fontSize: '.74rem', color: 'var(--gray)', marginTop: '-.3rem' }}>Leave any social blank to hide that icon on the homepage &amp; footer.</div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}><button onClick={() => saveContent('contact', contact, 'Contact updated — live on the homepage.')} disabled={busy} style={pubBtn(false)}>{busy ? 'Saving…' : 'Save'}</button></div>
            </div>
          )}
        </div>

        {/* ── PAYMENT METHODS ── */}
        <div style={{ ...card, marginBottom: '1.5rem' }}>
          <h2 style={cardTitle}>Payment Methods</h2>
          {payment === null ? <div style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>Loading…</div> : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <p style={{ color: 'var(--gray)', fontSize: '0.8rem', margin: 0, lineHeight: 1.6 }}>Single source of truth. Turning a method <strong>off</strong> removes it from the checkout options customers can pick <strong>and</strong> drops its logo from the homepage footer. Turn it back on to re-open it.</p>
              {PAY_METHODS.map(m => {
                const on = payment[m.id] !== false;
                return (
                  <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem 1rem', background: 'var(--dark2)', display: 'flex', alignItems: 'center', gap: '0.9rem', opacity: on ? 1 : 0.6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--white)' }}>{m.label}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--gray)', marginTop: 2 }}>{m.sub}</div>
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: on ? 'var(--gold)' : 'var(--gray)', minWidth: 28 }}>{on ? 'ON' : 'OFF'}</span>
                    <button type="button" role="switch" aria-checked={on} onClick={() => setPayment(p => ({ ...p, [m.id]: !on }))} style={{ flex: '0 0 auto', width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? 'linear-gradient(135deg,var(--gold-light),var(--gold-dark))' : 'var(--dark3)', position: 'relative', transition: 'background 0.18s' }}>
                      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: 'var(--dark)', transition: 'left 0.18s' }} />
                    </button>
                  </div>
                );
              })}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => saveContent('payment_methods', { enabled: payment }, 'Payment methods updated — live on the storefront.')} disabled={busy} style={pubBtn(false)}>{busy ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          )}
        </div>

        {/* Other sections */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }} className="hp-2col">
          <div style={card}><h2 style={cardTitle}>Shop by Collections</h2><p style={{ color: 'var(--gray)', fontSize: '0.85rem', margin: '0 0 1rem', lineHeight: 1.6 }}>Managed in the Collections module (order + per-image focus).</p><Link href="/dashboard/business/collections" style={{ display: 'inline-flex', gap: '0.4rem', padding: '0.55rem 1.1rem', borderRadius: 8, background: 'var(--dark2)', border: '1px solid var(--border)', color: 'var(--white)', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600 }}>Open Collections →</Link></div>
          <div style={card}><h2 style={cardTitle}>All set</h2><p style={{ color: 'var(--gray)', fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>Every homepage section is editable here — Hero, Work Gallery, Pricing, Why-Us, How It Works &amp; Contact. Saving applies to the live homepage right away.</p></div>
        </div>

        {modal && (
          <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div onClick={e => e.stopPropagation()} style={{ ...card, maxWidth: 420, width: '100%' }}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)' }}>{modal.title}</h3>
              <p style={{ margin: '0 0 1.25rem', color: 'var(--gray-light)', fontSize: '0.9rem', lineHeight: 1.6 }}>{modal.message}</p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                {modal.type === 'confirm' ? (<>
                  <button onClick={() => setModal(null)} style={{ padding: '0.55rem 1.1rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray-light)', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={modal.onConfirm} disabled={busy} style={{ padding: '0.55rem 1.1rem', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#dc2626,#991b1b)', color: 'var(--dark)', cursor: 'pointer' }}>{busy ? 'Deleting…' : 'Delete'}</button>
                </>) : (
                  <button onClick={() => setModal(null)} style={{ padding: '0.55rem 1.1rem', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,var(--gold-light),var(--gold-dark))', color: 'var(--black)', cursor: 'pointer' }}>{modal.type === 'success' ? 'Done' : 'OK'}</button>
                )}
              </div>
            </div>
          </div>
        )}

        <style jsx>{`@media (max-width: 1024px) { .hp-2col { grid-template-columns: 1fr !important; } } @media (max-width: 768px) { .hp-price-row { grid-template-columns: 1fr !important; } }`}</style>
      </div>
    </ErrorBoundary>
  );
}
