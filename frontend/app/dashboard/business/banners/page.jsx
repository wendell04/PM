'use client';

/**
 * BANNER MANAGEMENT PAGE
 *
 * Backend-connected banner management via MongoDB API
 */

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import {
  getBanners,
  createBanner as apiCreateBanner,
  updateBanner as apiUpdateBanner,
  deleteBanner as apiDeleteBanner,
  publishBanner as apiPublishBanner,
  unpublishBanner as apiUnpublishBanner,
} from '@/lib/bannerUtils';
import ErrorBoundary from '@/components/ErrorBoundary';

// UX limit — keeps carousel manageable regardless of storage backend
// Safe to keep even after MongoDB migration (enforced at API level too)
const MAX_BANNERS = 5;

// TODO: Cloudinary — Replace fileToBase64 with Cloudinary upload
// CURRENT: Converts image to base64 string, stored in localStorage (max ~5MB total)
// FUTURE:
//   const uploadToCloudinary = async (file) => {
//     const formData = new FormData();
//     formData.append('file', file);
//     formData.append('folder', 'banners');
//     const res = await fetch('/api/upload', { method: 'POST', body: formData });
//     const { url } = await res.json();
//     return url; // Store this Cloudinary URL in banner.imageUrl
//   };
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

// ── Default Banner ──────────────────────────────────────────────────────────────
const createDefaultBanner = () => ({
  headline: '',
  subtext: '',
  ctaLabel: '',
  ctaLink: '',
  image: null,
  isVisible: false,
  status: 'draft',
  scheduleStart: null,
  scheduleEnd: null,
  order: 0,
});

// ── Calendar Helpers ────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function toYMD(date) {
  if (!date) return '';
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseYMD(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplay(str) {
  if (!str) return null;
  const d = parseYMD(str);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

// ── Single Calendar Dropdown ────────────────────────────────────────────────────
function CalendarDropdown({ value, onChange, minDate, placeholder, onClear }) {
  const [open, setOpen]           = useState(false);
  const [viewYear, setViewYear]   = useState(() => (value ? parseYMD(value) : new Date()).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (value ? parseYMD(value) : new Date()).getMonth());
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };
  const selectDay = (day) => { onChange(toYMD(new Date(viewYear, viewMonth, day))); setOpen(false); };

  const isSelected = (day) => {
    if (!value) return false;
    const d = parseYMD(value);
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === day;
  };
  const isDisabled = (day) => {
    if (!minDate) return false;
    return new Date(viewYear, viewMonth, day) < parseYMD(minDate);
  };
  const isToday = (day) => {
    const t = new Date();
    return t.getFullYear() === viewYear && t.getMonth() === viewMonth && t.getDate() === day;
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay    = getFirstDayOfMonth(viewYear, viewMonth);
  const cells       = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      {/* Trigger */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.625rem',
          background: 'var(--dark)', border: `1px solid ${open ? 'var(--gold)' : 'var(--dark2)'}`,
          borderRadius: '8px', padding: '0.7rem 1rem', cursor: 'pointer',
          boxShadow: open ? '0 0 0 3px rgba(212,168,67,0.12)' : 'none',
          transition: 'border-color 0.18s, box-shadow 0.18s', userSelect: 'none',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span style={{ flex: 1, fontSize: '0.875rem', fontFamily: "'DM Sans', sans-serif", color: value ? 'var(--white)' : 'var(--gray)' }}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        {value && (
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', borderRadius: '4px', transition: 'color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--gold)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--gray)'; }}
            title="Clear"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2.5"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 999,
          background: 'var(--dark)', border: '1px solid var(--dark2)', borderRadius: '12px',
          padding: '1rem', width: '268px', boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          animation: 'drpIn 0.15s ease',
        }}>
          <style>{`
            @keyframes drpIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
            .drp-cell-btn {
              aspect-ratio: 1; width: 100%; display: flex; align-items: center; justify-content: center;
              font-size: 0.8rem; border-radius: 6px; cursor: pointer;
              color: #aaa; font-family: 'DM Sans', sans-serif;
              border: none; background: none; transition: background 0.13s, color 0.13s;
            }
            .drp-cell-btn:hover:not(:disabled) { background: #2a2a2a; color: #fff; }
            .drp-cell-btn.is-today { color: #d4a843; font-weight: 700; }
            .drp-cell-btn.is-selected { background: #d4a843 !important; color: #111 !important; font-weight: 700; }
            .drp-cell-btn:disabled { color: #333; cursor: not-allowed; }
            .drp-nav-btn {
              background: none; border: none; color: #888; cursor: pointer;
              width: 28px; height: 28px; border-radius: 6px; display: flex;
              align-items: center; justify-content: center; font-size: 1.1rem;
              transition: background 0.15s, color 0.15s;
            }
            .drp-nav-btn:hover { background: #2a2a2a; color: #d4a843; }
          `}</style>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <button className="drp-nav-btn" onClick={prevMonth}>‹</button>
            <span style={{ fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 700, color: 'var(--white)' }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button className="drp-nav-btn" onClick={nextMonth}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {DAYS.map(d => (
              <div key={d} style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--gray)', textAlign: 'center', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d}</div>
            ))}
            {cells.map((day, i) => (
              <button
                key={i}
                className={['drp-cell-btn', day && isToday(day) && !isSelected(day) ? 'is-today' : '', day && isSelected(day) ? 'is-selected' : ''].join(' ')}
                onClick={() => day && !isDisabled(day) && selectDay(day)}
                disabled={!day || isDisabled(day)}
              >
                {day || ''}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Date Range Picker ───────────────────────────────────────────────────────────
function DateRangePicker({ startValue, endValue, onStartChange, onEndChange }) {
  const [hasDateRange, setHasDateRange] = useState(!!(startValue || endValue));
  const [removeBtnHover, setRemoveBtnHover] = useState(false);
  const [toggleBtnHover, setToggleBtnHover] = useState(false);

  const CalIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );

  if (!hasDateRange) {
    return (
      <div style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          onClick={() => setHasDateRange(true)}
          onMouseEnter={() => setToggleBtnHover(true)}
          onMouseLeave={() => setToggleBtnHover(false)}
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem',
            background: toggleBtnHover ? 'rgba(212,168,67,0.1)' : 'rgba(212,168,67,0.05)',
            border: `1px dashed ${toggleBtnHover ? 'var(--gold)' : 'rgba(212,168,67,0.3)'}`,
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            textAlign: 'left',
          }}
        >
          <span style={{
            width: 32, height: 32, borderRadius: 6,
            background: 'rgba(212,168,67,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <CalIcon />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1 }}>
            <span style={{ color: 'var(--white)', fontWeight: 600, fontSize: '0.875rem', fontFamily: "'DM Sans', sans-serif" }}>
              Set Date Range
            </span>
            <span style={{ color: 'var(--gray)', fontWeight: 400, fontSize: '0.75rem', fontFamily: "'DM Sans', sans-serif" }}>
              Banner will be live indefinitely
            </span>
          </div>
        </button>
      </div>
    );
  }

  const fieldLabelStyle = {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'var(--gray)',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    marginBottom: '0.4rem',
    fontFamily: "'DM Sans', sans-serif",
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '1rem',
      padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px',
    }}>
      <div>
        <div style={fieldLabelStyle}><CalIcon /> Schedule Start</div>
        <CalendarDropdown
          placeholder="Select start date..."
          value={startValue}
          onChange={onStartChange}
          onClear={() => onStartChange('')}
        />
      </div>
      <div>
        <div style={fieldLabelStyle}><CalIcon /> Schedule End</div>
        <CalendarDropdown
          placeholder="Select end date..."
          value={endValue}
          onChange={onEndChange}
          minDate={startValue || undefined}
          onClear={() => onEndChange('')}
        />
      </div>
      <button
        type="button"
        onClick={() => { onStartChange(''); onEndChange(''); setHasDateRange(false); }}
        onMouseEnter={() => setRemoveBtnHover(true)}
        onMouseLeave={() => setRemoveBtnHover(false)}
        style={{
          width: 'auto',
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          background: removeBtnHover ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${removeBtnHover ? 'var(--red)' : 'rgba(239,68,68,0.3)'}`,
          borderRadius: '6px',
          color: 'var(--red)',
          fontSize: '0.75rem',
          fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif",
          cursor: 'pointer',
          transition: 'all 0.2s',
          marginTop: '0.25rem',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Remove Date Range
      </button>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────────
export default function BannerManagementPage() {
  const { token } = useAuth();
  const fileInputRef = useRef(null);
  const carouselIntervalRef = useRef(null);

  const [banners, setBanners] = useState([]);
  const [activeBannerId, setActiveBannerIdLocal] = useState(null);
  const [editedBanner, setEditedBanner] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  // ── Load banners on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    async function loadBanners() {
      setIsLoading(true);
      try {
        const loadedBanners = await getBanners(token);
        if (loadedBanners.length > 0) {
          setBanners(loadedBanners);
          setActiveBannerIdLocal(loadedBanners[0]._id || loadedBanners[0].id);
          setEditedBanner({ ...loadedBanners[0] });
        } else {
          setBanners([]);
          setEditedBanner(null);
        }
      } catch (err) {
        console.error('Failed to load banners:', err);
        setBanners([]);
        setEditedBanner(null);
      } finally {
        setIsLoading(false);
      }
    }
    loadBanners();
  }, [token]);

  useEffect(() => {
    if (editedBanner && activeBannerId) {
      const originalBanner = banners.find(b => b.id === activeBannerId);
      if (originalBanner) setHasUnsavedChanges(JSON.stringify(editedBanner) !== JSON.stringify(originalBanner));
    }
  }, [editedBanner, activeBannerId, banners]);

  useEffect(() => {
    if (!isAutoPlaying || banners.length <= 1) return;
    carouselIntervalRef.current = setInterval(() => setCurrentSlide(prev => (prev + 1) % banners.length), 5000);
    return () => { if (carouselIntervalRef.current) clearInterval(carouselIntervalRef.current); };
  }, [isAutoPlaying, banners.length]);

  useEffect(() => {
    if (activeBannerId && banners.length > 0) {
      const index = banners.findIndex(b => b.id === activeBannerId);
      if (index !== -1 && index !== currentSlide) setCurrentSlide(index);
    }
  }, [activeBannerId, banners, currentSlide]);

  const selectBanner = (bannerId) => {
    const banner = banners.find(b => (b._id || b.id) === bannerId);
    if (banner) {
      setActiveBannerIdLocal(banner._id || banner.id);
      setEditedBanner({ ...banner });
    }
  };

  // Create new banner via API
  const createNewBanner = async () => {
    if (banners.length >= MAX_BANNERS) {
      setModal({
        type: 'error',
        title: 'Banner Limit Reached',
        message: `You can only have up to ${MAX_BANNERS} banners at a time. Delete an existing banner to add a new one.`,
      });
      return;
    }
    setIsLoading(true);
    try {
      const newBanner = await apiCreateBanner(createDefaultBanner(), token);
      const updatedBanners = [...banners, newBanner];
      setBanners(updatedBanners);
      selectBanner(newBanner._id || newBanner.id);
    } catch (err) {
      console.error('Failed to create banner:', err);
      setModal({
        type: 'error',
        title: 'Create Failed',
        message: err.message || 'Failed to create banner. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Delete banner via API
  const deleteBanner = async (bannerId) => {
    setModal({
      type: 'confirm',
      title: 'Delete Banner',
      message: 'Are you sure you want to delete this banner? This action cannot be undone.',
      onConfirm: async () => {
        setIsSubmitting(true);
        setIsLoading(true);
        try {
          await apiDeleteBanner(bannerId, token);
          const updatedBanners = banners.filter(b => (b._id || b.id) !== bannerId);
          setBanners(updatedBanners);
          if (activeBannerId === bannerId) {
            if (updatedBanners.length > 0) {
              selectBanner(updatedBanners[0]._id || updatedBanners[0].id);
            } else {
              setActiveBannerIdLocal(null);
              setEditedBanner(null);
            }
          }
          setModal(null);
        } catch (err) {
          console.error('Failed to delete banner:', err);
          setModal({
            type: 'error',
            title: 'Delete Failed',
            message: err.message || 'Failed to delete banner. Please try again.',
          });
        } finally {
          setIsLoading(false);
          setIsSubmitting(false);
        }
      },
    });
  };

  // Move banner (reorder) - updates order locally, will sync on next save
  const moveBanner = async (index, direction) => {
    if (isSubmitting) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= banners.length) return;

    const updatedBanners = [...banners];
    [updatedBanners[index], updatedBanners[newIndex]] = [updatedBanners[newIndex], updatedBanners[index]];
    updatedBanners.forEach((b, idx) => { b.order = idx; });

    setIsSubmitting(true);
    setIsLoading(true);
    try {
      // Update the moved banner's order via API
      const movedBanner = updatedBanners[newIndex];
      await apiUpdateBanner(movedBanner._id || movedBanner.id, { order: movedBanner.order }, token);
      setBanners(updatedBanners);
    } catch (err) {
      console.error('Failed to reorder banner:', err);
      setModal({
        type: 'error',
        title: 'Reorder Failed',
        message: err.message || 'Failed to reorder banner. Please try again.',
      });
    } finally {
      setIsLoading(false);
      setIsSubmitting(false);
    }
  };

  const updateField = (field, value) => {
    setEditedBanner(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const discardChanges = () => {
    if (!activeBannerId) return;
    const originalBanner = banners.find(b => (b._id || b.id) === activeBannerId);
    if (originalBanner) { setEditedBanner({ ...originalBanner }); setHasUnsavedChanges(false); }
  };

  // Save edited banner via API
  const saveChanges = async () => {
    if (!editedBanner || !activeBannerId) return;
    setIsLoading(true);
    try {
      const updatedBanner = await apiUpdateBanner(activeBannerId, editedBanner, token);
      const updatedBanners = banners.map(b => (b._id || b.id) === activeBannerId ? updatedBanner : b);
      setBanners(updatedBanners);
      setEditedBanner(updatedBanner);
      setHasUnsavedChanges(false);
      setModal({
        type: 'success',
        title: 'Banner Updated',
        message: 'Banner has been updated successfully.',
      });
      setTimeout(() => setModal(null), 2000);
    } catch (err) {
      console.error('Failed to save banner:', err);
      setModal({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Failed to save banner. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Publish banner via API
  const publishBanner = async () => {
    if (!editedBanner) return;
    setIsLoading(true);
    try {
      const updatedBanner = await apiPublishBanner(activeBannerId, token);
      const updatedBanners = banners.map(b => (b._id || b.id) === activeBannerId ? updatedBanner : b);
      setBanners(updatedBanners);
      setEditedBanner(updatedBanner);
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Failed to publish banner:', err);
      setModal({
        type: 'error',
        title: 'Publish Failed',
        message: err.message || 'Failed to publish banner. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Unpublish banner via API
  const unpublishBanner = async () => {
    if (!editedBanner || isSubmitting) return;
    setIsSubmitting(true);
    setIsLoading(true);
    try {
      const updatedBanner = await apiUnpublishBanner(activeBannerId, token);
      const updatedBanners = banners.map(b => (b._id || b.id) === activeBannerId ? updatedBanner : b);
      setBanners(updatedBanners);
      setEditedBanner(updatedBanner);
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Failed to unpublish banner:', err);
      setModal({
        type: 'error',
        title: 'Unpublish Failed',
        message: err.message || 'Failed to unpublish banner. Please try again.',
      });
    } finally {
      setIsLoading(false);
      setIsSubmitting(false);
    }
  };

  // ── Image Upload ─────────────────────────────────────────────────────────────
  // TODO: Cloudinary — Replace base64 with Cloudinary upload
  // CURRENT: Converts image to base64 string, stored directly in localStorage
  //          NOTE: localStorage has a ~5MB limit — large images will cause errors
  // FUTURE:
  //   const url = await uploadToCloudinary(file); // returns Cloudinary URL
  //   updateField('imageUrl', url);               // store URL, not base64
  //   On banner delete also call: DELETE /api/upload/:publicId
  const handleImageUpload = async (file) => {
    if (!file) return;
    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setModal({ type: 'error', title: 'Invalid File Type', message: 'Please upload PNG, JPEG, or WebP images only.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setModal({ type: 'error', title: 'File Too Large', message: 'Image size must be less than 5MB.' });
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      updateField('image', base64);
    } catch (error) {
      console.error('Error uploading image:', error);
      setModal({ type: 'error', title: 'Upload Failed', message: 'Failed to upload image. Please try again.' });
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleImageUpload(file);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No expiry';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusBadge = (banner) => {
    if (banner.status === 'live' && banner.isVisible) return <span className="banner-status-badge live">Live</span>;
    if (banner.status === 'scheduled') return <span className="banner-status-badge scheduled">Scheduled</span>;
    return <span className="banner-status-badge draft">Draft</span>;
  };

  const goToSlide = (index) => { setCurrentSlide(index); setIsAutoPlaying(false); setTimeout(() => setIsAutoPlaying(true), 10000); };

  const isLive = banners.find(b => b.id === activeBannerId)?.status === 'live';

  if (isLoading) {
    return (
      <div className="skeleton-page" style={{ padding: "2rem" }}>
        <style>{`
          @keyframes bnPageSkel { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        `}</style>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "1400px", margin: "0 auto" }}>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              style={{
                height: "56px",
                borderRadius: "8px",
                background: "rgba(255,255,255,0.04)",
                animation: "bnPageSkel 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div className="banner-management-container">
      <style jsx>{`
        .banner-management-container { padding: 2rem; max-width: 1400px; margin: 0 auto; background: var(--black); min-height: 100vh; }

        .banner-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
        .banner-actions { display: flex; gap: 0.75rem; }
        .banner-btn { padding: 0.625rem 1.5rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none; font-family: 'DM Sans', sans-serif; }
        .banner-btn-secondary { background: transparent; border: 1px solid var(--border); color: var(--gray-light); }
        .banner-btn-secondary:hover { border-color: var(--gold); color: var(--white); }
        .banner-btn-primary { background: linear-gradient(135deg, var(--gold-light), var(--gold-dark)); color: var(--black); font-weight: 700; }
        .banner-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(212, 168, 67, 0.3); }
        .banner-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .banner-grid { display: grid; grid-template-columns: 340px 1fr; gap: 1.5rem; }
        .banner-left-column { display: flex; flex-direction: column; gap: 1.5rem; }
        .banner-right-column { display: flex; flex-direction: column; gap: 1.5rem; }

        .banner-card { background: var(--dark); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
        .banner-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
        .banner-card-title { font-family: 'DM Sans', sans-serif; font-size: 1.125rem; font-weight: 700; color: var(--white); margin: 0; }

        .banner-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .banner-item { display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--dark2); border-radius: 10px; cursor: pointer; transition: all 0.2s; border-left: 3px solid transparent; position: relative; }
        .banner-item:hover { background: rgba(212, 168, 67, 0.05); }
        .banner-item.active { background: rgba(212, 168, 67, 0.08); border-left-color: var(--gold); }
        .banner-item.inactive { opacity: 0.6; }
        .banner-item-thumbnail { width: 80px; height: 50px; border-radius: 6px; overflow: hidden; flex-shrink: 0; background: var(--dark3); display: flex; align-items: center; justify-content: center; color: var(--gray); font-size: 0.625rem; }
        .banner-item-thumbnail img { width: 100%; height: 100%; object-fit: cover; }
        .banner-item-info { flex: 1; min-width: 0; }
        .banner-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem; }
        .banner-item-name { font-weight: 600; font-size: 0.875rem; color: var(--white); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .banner-status-badge { font-size: 0.625rem; padding: 0.125rem 0.5rem; border-radius: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .banner-status-badge.live { background: rgba(212, 168, 67, 0.15); color: var(--gold); }
        .banner-status-badge.draft { background: var(--dark3); color: var(--gray); }
        .banner-status-badge.scheduled { background: rgba(100, 150, 255, 0.15); color: #6496ff; }
        .banner-item-meta { font-size: 0.75rem; color: var(--gray); }
        .banner-item-actions { display: flex; gap: 0.25rem; align-items: center; }
        .banner-item-action-btn { background: none; border: none; color: var(--gray); cursor: pointer; padding: 0.375rem; font-size: 0.875rem; transition: color 0.2s; border-radius: 4px; }
        .banner-item-action-btn:hover { color: var(--white); background: var(--dark3); }
        .banner-item-action-btn.delete:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
        .banner-order-btns { display: flex; flex-direction: column; gap: 0.125rem; }
        .banner-order-btn { background: none; border: none; color: var(--gray); cursor: pointer; padding: 0.125rem; font-size: 0.625rem; transition: color 0.2s; line-height: 1; }
        .banner-order-btn:hover { color: var(--gold); }
        .banner-add-btn { width: 100%; padding: 0.875rem; margin-top: 0.5rem; border: 1px dashed var(--border); border-radius: 8px; background: transparent; color: var(--gray-light); font-size: 0.875rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: all 0.2s; }
        .banner-add-btn:hover { border-color: var(--gold); color: var(--gold); background: rgba(212, 168, 67, 0.05); }

        .banner-upload-area { aspect-ratio: 16/5; background: var(--dark2); border: 2px dashed var(--border); border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--gray); cursor: pointer; transition: all 0.2s; }
        .banner-upload-area:hover { border-color: var(--gold); }
        .banner-upload-area.drag-over { border-color: var(--gold); background: rgba(212, 168, 67, 0.05); }
        .banner-upload-text { font-size: 0.875rem; font-weight: 600; }
        .banner-upload-hint { font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.25rem; }

        .banner-preview-container { background: var(--dark); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; position: relative; }
        .banner-preview-badge { position: absolute; top: 1rem; left: 1rem; z-index: 10; background: rgba(0, 0, 0, 0.8); padding: 0.375rem 0.75rem; border-radius: 20px; display: flex; align-items: center; gap: 0.5rem; font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--white); }
        .banner-preview-indicator { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #ef4444; animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .banner-preview-canvas { position: relative; width: 100%; aspect-ratio: 16/5; overflow: hidden; }
        .banner-preview-slide { position: absolute; inset: 0; transition: opacity 0.5s ease; }
        .banner-preview-slide.active { opacity: 1; z-index: 1; }
        .banner-preview-slide.inactive { opacity: 0; z-index: 0; }
        .banner-preview-image { width: 100%; height: 100%; object-fit: cover; object-position: center center; }
        .banner-preview-overlay { position: absolute; inset: 0; background: linear-gradient(to right, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, transparent 100%); }
        .banner-preview-content { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 3rem 4rem; padding-left: 6rem; gap: 1rem; }
        .banner-preview-headline { font-family: 'DM Sans', sans-serif; font-size: 2.5rem; font-weight: 800; color: var(--white); max-width: 32rem; line-height: 1.1; text-align: left; }
        .banner-preview-subtext { font-size: 1rem; color: var(--gray-light); max-width: 28rem; line-height: 1.6; text-align: left; }
        .banner-preview-cta { padding-top: 1rem; }
        .banner-preview-cta-btn { background: linear-gradient(135deg, var(--gold-light), var(--gold-dark)); color: var(--black); font-weight: 700; padding: 0.75rem 2rem; border-radius: 8px; border: none; font-size: 0.875rem; cursor: pointer; }
        .banner-carousel-dots { position: absolute; bottom: 1rem; left: 50%; transform: translateX(-50%); z-index: 20; display: flex; gap: 0.5rem; }
        .banner-carousel-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255, 255, 255, 0.3); border: none; cursor: pointer; transition: all 0.2s; }
        .banner-carousel-dot.active { background: var(--gold); width: 24px; border-radius: 4px; }
        .banner-carousel-dot:hover { background: rgba(212, 168, 67, 0.6); }

        .banner-editor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
        .banner-editor-card { background: var(--dark); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
        .banner-editor-card-title { font-family: 'DM Sans', sans-serif; font-size: 1.125rem; font-weight: 700; color: var(--white); margin: 0 0 1.5rem 0; padding-bottom: 1rem; border-bottom: 1px solid var(--border); }

        .banner-form-group { margin-bottom: 1.25rem; }
        .banner-form-label { display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; font-weight: 600; color: var(--gray); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
        .banner-char-count { font-size: 0.625rem; font-weight: 500; color: var(--gray); text-transform: none; letter-spacing: 0; }
        .banner-form-input, .banner-form-textarea { width: 100%; background: var(--dark2); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem 1rem; color: var(--white); font-size: 0.875rem; font-family: 'DM Sans', sans-serif; transition: all 0.2s; }
        .banner-form-input:focus, .banner-form-textarea:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(212, 168, 67, 0.1); }
        .banner-form-input:disabled, .banner-form-textarea:disabled { opacity: 0.5; cursor: not-allowed; background: var(--dark3); }
        .banner-form-textarea { resize: vertical; min-height: 80px; }
        .banner-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

        /* Date Range Picker */
        .date-range-toggle-wrap { margin-bottom: 1rem; }
        .date-range-toggle-btn {
          width: 100%;
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem;
          background: rgba(212, 168, 67, 0.05);
          border: 1px dashed rgba(212, 168, 67, 0.3);
          border-radius: 8px;
          color: var(--gold);
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }
        .date-range-toggle-btn:hover {
          background: rgba(212, 168, 67, 0.1);
          border-color: var(--gold);
        }
        .date-range-toggle-text {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          flex: 1;
        }
        .date-range-toggle-text > div:first-child {
          color: var(--white);
          font-weight: 600;
          font-size: 0.875rem;
        }
        .date-range-toggle-sub {
          font-size: 0.75rem;
          font-weight: 400;
          color: var(--gray);
        }
        .date-range-inputs {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
        }
        .date-range-remove-btn {
          width: auto;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 6px;
          color: #ef4444;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 0.5rem;
        }
        .date-range-remove-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
        }

        .banner-unsaved-indicator { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: rgba(212, 168, 67, 0.1); border-radius: 6px; font-size: 0.75rem; color: var(--gold); margin-top: 1rem; }
        .banner-unsaved-dot { width: 0.5rem; height: 0.5rem; background: var(--gold); border-radius: 50%; animation: pulse 2s infinite; }

        .banner-modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 2rem; }
        .banner-modal { background: var(--dark); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; max-width: 400px; width: 100%; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); }
        .banner-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .banner-modal-title { font-family: 'DM Sans', sans-serif; font-size: 1.125rem; font-weight: 700; color: var(--white); margin: 0; }
        .banner-modal-close { background: none; border: none; color: var(--gray); cursor: pointer; padding: 0.25rem; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: all 0.2s; }
        .banner-modal-close:hover { background: var(--dark2); color: var(--white); }
        .banner-modal-body { margin-bottom: 1.5rem; }
        .banner-modal-message { color: var(--gray-light); font-size: 0.9rem; line-height: 1.6; margin: 0; }
        .banner-modal-footer { display: flex; gap: 0.75rem; justify-content: flex-end; }
        .banner-modal-btn { padding: 0.625rem 1.25rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none; font-family: 'DM Sans', sans-serif; }
        .banner-modal-btn-secondary { background: transparent; border: 1px solid var(--border); color: var(--gray-light); }
        .banner-modal-btn-secondary:hover { border-color: var(--gold); color: var(--white); }
        .banner-modal-btn-primary { background: linear-gradient(135deg, var(--gold-light), var(--gold-dark)); color: var(--black); }
        .banner-modal-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(212, 168, 67, 0.3); }
        .banner-modal-btn-danger { background: linear-gradient(135deg, #dc2626, #991b1b); color: var(--white); }
        .banner-modal-btn-danger:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3); }

        @media (max-width: 1024px) {
          .banner-grid { grid-template-columns: 1fr; }
          .banner-editor-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Header */}
      <div className="banner-header">
        <h1 className="page-title">Banners</h1>
        <div className="banner-actions">
          {isLive ? (
            <button className="banner-btn banner-btn-secondary" onClick={unpublishBanner} disabled={isSubmitting} style={{ opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>
              {isSubmitting ? 'Unpublishing...' : 'Unpublish'}
            </button>
          ) : (
            <>
              {hasUnsavedChanges ? (
                <button
                  className="banner-btn banner-btn-secondary"
                  onClick={saveChanges}
                  disabled={isLoading}
                >
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
              ) : null}
              <button
                className="banner-btn banner-btn-primary"
                onClick={publishBanner}
                disabled={!editedBanner?.image || isLoading}
                title={!editedBanner?.image ? 'Upload a banner image first' : ''}
              >
                {isLoading ? 'Publishing...' : 'Publish Live'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="banner-grid">
        {/* Left Column */}
        <div className="banner-left-column">
          {/* Banner Queue */}
          <div className="banner-card">
            <div className="banner-card-header">
              <h2 className="banner-card-title">Banner Queue</h2>
            </div>
            <div className="banner-list">
              {banners.map((banner, index) => (
                <div
                  key={banner.id}
                  className={`banner-item ${activeBannerId === banner.id ? 'active' : ''} ${!banner.isVisible ? 'inactive' : ''}`}
                  onClick={() => selectBanner(banner.id)}
                >
                  <div className="banner-order-btns">
                    <button className="banner-order-btn" onClick={(e) => { e.stopPropagation(); moveBanner(index, -1); }} disabled={index === 0 || isSubmitting} title="Move up">▲</button>
                    <button className="banner-order-btn" onClick={(e) => { e.stopPropagation(); moveBanner(index, 1); }} disabled={index === banners.length - 1 || isSubmitting} title="Move down">▼</button>
                  </div>
                  <div className="banner-item-thumbnail">
                    {banner.image ? <Image src={banner.image} alt={banner.name} width={48} height={48} style={{ objectFit: "cover" }} unoptimized /> : <span>No Image</span>}
                  </div>
                  <div className="banner-item-info">
                    <div className="banner-item-header">
                      <p className="banner-item-name">{banner.name || 'Untitled Banner'}</p>
                      {getStatusBadge(banner)}
                    </div>
                    <p className="banner-item-meta">
                      {banner.isVisible && banner.scheduleEnd
                        ? `Expires: ${formatDate(banner.scheduleEnd)}`
                        : banner.isVisible ? 'No expiry' : 'Not published'}
                    </p>
                  </div>
                  <div className="banner-item-actions">
                    <button className="banner-item-action-btn delete" onClick={(e) => { e.stopPropagation(); deleteBanner(banner.id); }} title="Delete banner">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
              {banners.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray)' }}>
                  No banners yet. Create your first banner!
                </div>
              )}
            </div>
            <button
              className="banner-add-btn"
              onClick={createNewBanner}
              disabled={banners.length >= MAX_BANNERS}
              style={{ opacity: banners.length >= MAX_BANNERS ? 0.5 : 1, cursor: banners.length >= MAX_BANNERS ? 'not-allowed' : 'pointer' }}
            >
              <span>+</span>
              {banners.length >= MAX_BANNERS ? `Max ${MAX_BANNERS} banners reached` : 'Add New Banner'}
              {banners.length > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--gray)', fontWeight: 400 }}>
                  {banners.length}/{MAX_BANNERS}
                </span>
              )}
            </button>
          </div>

          {/* Image Upload */}
          <div className="banner-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 className="banner-card-title" style={{ margin: 0 }}>Banner Image</h2>
              {isLive && (
                <span style={{
                  fontSize: '0.7rem', fontWeight: 600, color: 'var(--gold)',
                  background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.3)',
                  borderRadius: '4px', padding: '0.2rem 0.5rem',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Unpublish to change
                </span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => !isLive && handleImageUpload(e.target.files[0])}
              disabled={isLive}
            />
            <div
              className={`banner-upload-area ${dragOver && !isLive ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); if (!isLive) setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { if (!isLive) handleDrop(e); else e.preventDefault(); }}
              onClick={() => { if (!isLive) fileInputRef.current?.click(); }}
              style={{
                opacity: isLive ? 0.45 : 1,
                cursor: isLive ? 'not-allowed' : 'pointer',
                pointerEvents: isLive ? 'none' : 'auto',
              }}
            >
              <p className="banner-upload-text">
                {isLive ? 'Image locked while published' : 'Drop image here or click to upload'}
              </p>
              <p className="banner-upload-hint">
                {isLive ? 'Unpublish the banner to replace the image' : 'Recommended: 1920x600px (PNG, WebP, JPEG)'}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="banner-right-column">
          {/* Live Preview Carousel */}
          <div className="banner-preview-container">
            <div className="banner-preview-badge">
              <div className="banner-preview-indicator"></div>
              <span>Live Preview</span>
            </div>
            <div className="banner-preview-canvas">
              {banners.map((banner, index) => {
                const displayBanner = banner.id === activeBannerId && editedBanner ? editedBanner : banner;
                return (
                  <div key={banner.id} className={`banner-preview-slide ${index === currentSlide ? 'active' : 'inactive'}`}>
                    {displayBanner.image
                      ? <Image src={displayBanner.image} alt={displayBanner.name} className="banner-preview-image" fill style={{ objectFit: "cover" }} unoptimized />
                      : <div style={{ width: '100%', height: '100%', background: 'var(--dark3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)' }}>No Image</div>
                    }
                    <div className="banner-preview-overlay"></div>
                    {(displayBanner.headline || displayBanner.subtext || displayBanner.ctaLabel) && (
                      <div className="banner-preview-content">
                        {displayBanner.headline && <h2 className="banner-preview-headline">{displayBanner.headline}</h2>}
                        {displayBanner.subtext && <p className="banner-preview-subtext">{displayBanner.subtext}</p>}
                        {displayBanner.ctaLabel && (
                          <div className="banner-preview-cta">
                            <button className="banner-preview-cta-btn">{displayBanner.ctaLabel}</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Carousel Dots */}
              {banners.length > 1 && (
                <div className="banner-carousel-dots">
                  {banners.map((_, index) => (
                    <button key={index} className={`banner-carousel-dot ${index === currentSlide ? 'active' : ''}`} onClick={() => goToSlide(index)} title={`Go to slide ${index + 1}`} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Editor Controls */}
          <div className="banner-editor-grid">
            {/* Content */}
            <div className="banner-editor-card">
              <h3 className="banner-editor-card-title">Content</h3>
              <div className="banner-form-group">
                <label className="banner-form-label">Banner Name <span className="banner-char-count">{editedBanner?.name?.length || 0}/50</span></label>
                <input type="text" className="banner-form-input" value={editedBanner?.name || ''} onChange={(e) => updateField('name', e.target.value.slice(0, 50))} onKeyDown={e => { if (e.key === 'Enter' && !isLive) { e.preventDefault(); saveChanges(); } }} placeholder="Internal name for this banner..." maxLength={50} disabled={isLive} />
              </div>
              <div className="banner-form-group">
                <label className="banner-form-label">Headline <span className="banner-char-count">{editedBanner?.headline?.length || 0}/60</span></label>
                <input type="text" className="banner-form-input" value={editedBanner?.headline || ''} onChange={(e) => updateField('headline', e.target.value.slice(0, 60))} onKeyDown={e => { if (e.key === 'Enter' && !isLive) { e.preventDefault(); saveChanges(); } }} placeholder="Main headline text..." maxLength={60} disabled={isLive} />
              </div>
              <div className="banner-form-group">
                <label className="banner-form-label">Subtext <span className="banner-char-count">{editedBanner?.subtext?.length || 0}/200</span></label>
                <textarea className="banner-form-textarea" value={editedBanner?.subtext || ''} onChange={(e) => updateField('subtext', e.target.value.slice(0, 200))} placeholder="Description or supporting text..." rows={4} maxLength={200} disabled={isLive} />
              </div>
              <div className="banner-form-row">
                <div className="banner-form-group">
                  <label className="banner-form-label">Button Text <span className="banner-char-count">{editedBanner?.ctaLabel?.length || 0}/30</span></label>
                  <input type="text" className="banner-form-input" value={editedBanner?.ctaLabel || ''} onChange={(e) => updateField('ctaLabel', e.target.value.slice(0, 30))} onKeyDown={e => { if (e.key === 'Enter' && !isLive) { e.preventDefault(); saveChanges(); } }} placeholder="CTA button..." maxLength={30} disabled={isLive} />
                </div>
                <div className="banner-form-group">
                  <label className="banner-form-label">Button Link</label>
                  <input type="text" className="banner-form-input" value={editedBanner?.ctaLink || ''} onChange={(e) => updateField('ctaLink', e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !isLive) { e.preventDefault(); saveChanges(); } }} placeholder="/shop or /contact..." disabled={isLive} />
                </div>
              </div>
            </div>

            {/* Schedule */}
            <div className="banner-editor-card">
              <h3 className="banner-editor-card-title">Schedule</h3>

              {/* Custom dark calendar — no browser default inputs */}
              <DateRangePicker
                startValue={editedBanner?.scheduleStart || ''}
                endValue={editedBanner?.scheduleEnd || ''}
                onStartChange={(value) => updateField('scheduleStart', value)}
                onEndChange={(value) => updateField('scheduleEnd', value)}
              />

              <div className="banner-form-group" style={{ marginTop: '1.5rem' }}>
                <label className="banner-form-label">Display Order</label>
                <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.25rem' }}>
                  Use the ▲ ▼ buttons in the queue to reorder banners
                </p>
              </div>
            </div>
          </div>

          {hasUnsavedChanges && (
            <div className="banner-unsaved-indicator">
              <div className="banner-unsaved-dot"></div>
              <span>Unsaved changes — click "Publish Live" to save</span>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="banner-modal-overlay" onClick={() => setModal(null)}>
          <div className="banner-modal" onClick={(e) => e.stopPropagation()}>
            <div className="banner-modal-header">
              <h3 className="banner-modal-title">{modal.title}</h3>
              <button className="banner-modal-close" onClick={() => setModal(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="banner-modal-body">
              <p className="banner-modal-message">{modal.message}</p>
            </div>
            <div className="banner-modal-footer">
              {modal.type === 'confirm' ? (
                <>
                  <button className="banner-modal-btn banner-modal-btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                  <button className="banner-modal-btn banner-modal-btn-danger" onClick={modal.onConfirm} disabled={isSubmitting} style={{ opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>
                    {isSubmitting ? 'Deleting...' : 'Delete'}
                  </button>
                </>
              ) : (
                <button className="banner-modal-btn banner-modal-btn-primary" onClick={() => setModal(null)}>
                  {modal.type === 'success' ? 'Done' : 'OK'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}