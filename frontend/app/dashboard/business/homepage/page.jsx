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
const accentBg = (c) => (c === 'gold' ? '#c9973f' : c === 'red' ? '#dc2626' : '#f5f5f5');
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
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--white)' }}>Homepage</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--gray)' }}>Hero = taglines that loop, paired with images that cycle through all of them. Shop strips are in <Link href="/dashboard/business/banners" style={{ color: 'var(--gold)' }}>Banners</Link>.</p>
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
              <div><label style={lbl}>Headline (white)</label><input style={inp} value={editTag.headline || ''} onChange={e => setT('headline', e.target.value.slice(0, 60))} maxLength={60} /></div>
              {[1, 2].map(n => { const k = n === 1 ? 'headlineAccent' : 'headlineAccent2'; const ck = n === 1 ? 'headlineAccentColor' : 'headlineAccent2Color'; return (
                <div key={n}><label style={lbl}>Accent {n}{n === 2 ? ' (optional)' : ''}</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...inp, flex: 1 }} value={editTag[k] || ''} onChange={e => setT(k, e.target.value.slice(0, 60))} maxLength={60} />
                    <div style={{ display: 'flex', gap: 4 }}>{ACCENTS.map(c => <button key={c} type="button" onClick={() => setT(ck, c)} title={c} style={{ width: 28, height: 38, borderRadius: 6, border: `2px solid ${(editTag[ck] || 'gold') === c ? 'var(--white)' : 'transparent'}`, background: accentBg(c), cursor: 'pointer' }} />)}</div>
                  </div>
                </div>
              ); })}
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
                    {editImg.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={editImg.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center center', background: '#fff' }} /> : <span style={{ color: 'var(--gray)', fontSize: '0.82rem' }}>Drop / click to upload</span>}
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

        {/* Other sections */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }} className="hp-2col">
          <div style={card}><h2 style={cardTitle}>Shop by Collections</h2><p style={{ color: 'var(--gray)', fontSize: '0.85rem', margin: '0 0 1rem', lineHeight: 1.6 }}>Managed in the Collections module (order + per-image focus).</p><Link href="/dashboard/business/collections" style={{ display: 'inline-flex', gap: '0.4rem', padding: '0.55rem 1.1rem', borderRadius: 8, background: 'var(--dark2)', border: '1px solid var(--border)', color: 'var(--white)', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600 }}>Open Collections →</Link></div>
          <div style={card}><h2 style={cardTitle}>More sections</h2><p style={{ color: 'var(--gray)', fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>How It Works &amp; Pricing editors coming next. For now they’re set in code.</p></div>
        </div>

        {modal && (
          <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div onClick={e => e.stopPropagation()} style={{ ...card, maxWidth: 420, width: '100%' }}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)' }}>{modal.title}</h3>
              <p style={{ margin: '0 0 1.25rem', color: 'var(--gray-light)', fontSize: '0.9rem', lineHeight: 1.6 }}>{modal.message}</p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                {modal.type === 'confirm' ? (<>
                  <button onClick={() => setModal(null)} style={{ padding: '0.55rem 1.1rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray-light)', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={modal.onConfirm} disabled={busy} style={{ padding: '0.55rem 1.1rem', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#dc2626,#991b1b)', color: '#fff', cursor: 'pointer' }}>{busy ? 'Deleting…' : 'Delete'}</button>
                </>) : (
                  <button onClick={() => setModal(null)} style={{ padding: '0.55rem 1.1rem', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,var(--gold-light),var(--gold-dark))', color: 'var(--black)', cursor: 'pointer' }}>{modal.type === 'success' ? 'Done' : 'OK'}</button>
                )}
              </div>
            </div>
          </div>
        )}

        <style jsx>{`@media (max-width: 1024px) { .hp-2col { grid-template-columns: 1fr !important; } }`}</style>
      </div>
    </ErrorBoundary>
  );
}
