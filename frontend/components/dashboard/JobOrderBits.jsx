'use client';

// Shared Job Order presentation. The status map, the date formatter and the artwork preview used to
// be copy-pasted into job-orders, production-preview and qc-preview - three copies that drifted apart
// (only one of them resolved a design file path correctly). One definition now serves all three.

import { S } from '../../app/dashboard/business/inventory-v2/shared';

export const JO_BADGE = {
  'Queued':      { bg: 'var(--st-blue-bg)',   color: 'var(--st-blue-fg)',   border: 'rgba(96,165,250,0.35)', label: 'Queued' },
  'In Progress': { bg: 'var(--gold-subtle)',  color: 'var(--gold)',         border: 'rgba(212,168,67,0.35)', label: 'In Progress' },
  'QC_Pending':  { bg: 'var(--st-purple-bg)', color: 'var(--st-purple-fg)', border: 'rgba(168,85,247,0.35)', label: 'For QC' },
  'QC_Passed':   { bg: 'var(--st-green-bg)',  color: 'var(--st-green-fg)',  border: 'rgba(34,197,94,0.35)',  label: 'QC Passed' },
  'QC_Failed':   { bg: 'var(--st-red-bg)',    color: 'var(--st-red-fg)',    border: 'rgba(239,68,68,0.35)',  label: 'QC Failed' },
  'Completed':   { bg: 'var(--st-green-bg)',  color: 'var(--st-green-fg)',  border: 'rgba(34,197,94,0.35)',  label: 'Completed' },
  'Cancelled':   { bg: 'var(--st-red-bg)',    color: 'var(--st-red-fg)',    border: 'rgba(239,68,68,0.35)',  label: 'Cancelled' },
};

export const JO_STATUSES = ['Queued', 'In Progress', 'QC_Pending', 'QC_Passed', 'QC_Failed', 'Completed', 'Cancelled'];

export function JobOrderStatusBadge({ status }) {
  const c = JO_BADGE[status] || { bg: 'var(--dark2)', color: 'var(--gray)', border: 'var(--border)', label: status };
  return <span style={{ ...S.badge, background: c.bg, color: c.color, border: `1px solid ${c.border}`, fontSize: '11px' }}>{c.label}</span>;
}

export function RushBadge({ isRush }) {
  if (!isRush) return null;
  return <span style={{ ...S.badge, background: 'var(--st-red-bg)', color: 'var(--st-red-fg)', border: '1px solid #fecaca', marginLeft: 6, fontSize: '10px' }}>RUSH</span>;
}

/** The document id to address a job order by. Mongo ids can arrive as a plain string or, when a
 *  document is serialised straight from BSON, as {"$oid": "..."} - addressing the latter directly
 *  stringifies to "[object Object]" and every write 404s. */
export function joDocId(jo) {
  const raw = jo?._id ?? jo?.id;
  if (!raw) return null;
  if (typeof raw === 'object') return raw.$oid ?? raw.oid ?? String(raw);
  return String(raw);
}

export function fmtJODate(s) {
  if (!s) return '-';
  const d = new Date(s);
  return isNaN(d) ? '-' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/** Resolve a stored design path to something a browser can open. Backend saves a storage-relative
 *  path; linking to it raw resolves against the frontend origin and 404s. */
export function designUrl(raw) {
  if (!raw) return null;
  const s = String(raw);
  return s.startsWith('http') ? s : `${API_BASE}/storage/${s.replace(/^\/+/, '')}`;
}

/**
 * A still frame for a video, so the box is never blank while the clip loads.
 * Cloudinary will render any frame of a stored video as an image if you ask for it by picture
 * extension, so swapping .mp4 for .jpg costs one cheap image request instead of decoding the clip.
 * Returns null for anything not hosted there - a plain <video> is left to fend for itself.
 */
export function videoPoster(url) {
  if (!url || !/res\.cloudinary\.com/.test(url)) return null;
  if (!/\/video\/upload\//.test(url) && !/\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(url)) return null;
  return url.replace(/\.(mp4|webm|mov|m4v|ogg)(\?|$)/i, '.jpg$2');
}

/**
 * A browser-playable delivery URL for a stored video.
 *
 * A phone or a screen recorder will happily produce a clip in a codec Chrome cannot decode - it
 * shows the poster, then sits at 0:00 and never plays. Cloudinary can transcode on delivery, so we
 * ask it for H.264 in an MP4 container, which every browser handles. The first request for a given
 * clip takes a moment while it encodes; after that it is cached. Non-Cloudinary URLs pass through.
 */
export function playableVideo(url) {
  if (!url || !/res\.cloudinary\.com/.test(url)) return url;
  if (!/\/upload\//.test(url)) return url;
  if (/\/upload\/(f_|vc_)/.test(url)) return url;           // already asked for a format
  return url
    .replace(/\/upload\//, '/upload/f_mp4,vc_h264,q_auto/')
    .replace(/\.(mov|m4v|webm|ogg|avi|mkv)(\?|$)/i, '.mp4$2');
}

/**
 * The artwork the shop floor prints and QC inspects. Production without the design in front of it is
 * guesswork, so this is a first-class column on both worklists, not a footnote.
 */
export function DesignPreview({ path, size = 46, label = 'Open', onOpen }) {
  const url = designUrl(path);
  if (!url) {
    return (
      <div style={{ width: size, height: size, borderRadius: 6, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--gray)', textAlign: 'center', lineHeight: 1.1 }}>
        no art
      </div>
    );
  }
  const isImg = /\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i.test(url);
  const isVid = /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(url);
  const box = { width: size, height: size, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--dark)', objectFit: 'contain', display: 'block' };

  // With `onOpen` the caller is handling the click, so this must NOT also be a link - nesting the old
  // anchor inside a caller's button fired both, opening a tab AND a preview from one press. Video also
  // becomes a still here: a <video> in a 46px box renders as a black rectangle with a controls menu,
  // which tells the operator nothing.
  const poster = isVid ? (videoPoster(url) ?? null) : null;

  if (onOpen) {
    const inner = isVid
      ? (poster
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={poster} alt="Design to print" style={{ ...box, objectFit: 'cover' }} />
          : <span style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: '#000', fontSize: size / 3 }}>{'\u25B6'}</span>)
      : isImg
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="Design to print" style={{ ...box, objectFit: 'cover' }} />
        : <span style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--gold)' }}>{label}</span>;

    return (
      <button type="button" onClick={() => onOpen(url)} title="Click to preview"
        style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'zoom-in', lineHeight: 0 }}>
        {inner}
      </button>
    );
  }

  if (isVid) return <video src={playableVideo(url)} muted playsInline controls preload="none" poster={poster ?? undefined} style={{ ...box, background: '#000' }} />;
  if (isImg) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" title="Open full artwork" style={{ display: 'block', width: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Design to print" style={box} />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title="Open artwork file"
      style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--gold)', textDecoration: 'none' }}>
      {label}
    </a>
  );
}

/** Placeholder rows while a worklist loads. Page-level loading is a skeleton, not a spinner. */
export function TableSkeleton({ cols = 7, rows = 4 }) {
  const bar = (w) => ({ height: 12, borderRadius: 4, background: 'var(--dark2)', animation: 'pmPulse 1.4s ease-in-out infinite', width: w });
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={`sk_${r}`}>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={`sk_${r}_${c}`} style={{ ...S.td }}>
              {r === 0 && c === 0 && <style>{`@keyframes pmPulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>}
              <div style={bar(c === 0 ? '70%' : c === 1 ? '85%' : '55%')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
