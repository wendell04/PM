'use client';
import { cloudinaryThumb } from '@/lib/cloudinaryImage';

// One stage plus a thumbnail strip, for reviewing the design files sent on an order.
//
// A proof is judged, not browsed: the customer looks at one thing carefully and then decides. A grid
// of every file works against that - it makes each file small, and with five of them it pushes the
// Approve button out of the modal. The files also arrive in wildly different shapes (a portrait clip
// from a phone next to a landscape mockup), so a fixed stage with `contain` keeps the layout from
// jumping every time you move between them.
//
// With a single file the strip, the arrows and the counter all disappear - the common case pays no
// tax for the multi-file one.
//
// `tiles` drops the stage and leaves only the clickable thumbnails. The owner's Orders panel uses it:
// that panel already stacks customer, address, design, status and delivery in one row, so a tall
// stage pushed everything else off screen - and the owner only needs to confirm WHAT went out, not
// judge it. The customer keeps the stage, because approving or rejecting is their decision to make.

import { useState, useEffect, useRef } from 'react';
import { videoPoster, playableVideo } from '../dashboard/JobOrderBits';

const isVideo = (u) => /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(u || '');
const isImage = (u) => /\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i.test(u || '');

export default function ProofGallery({ urls = [], onOpen, height = 260, compact = false, tiles = false }) {
  const files = (urls || []).filter(Boolean);
  const [i, setI] = useState(0);
  const stageRef = useRef(null);
  const signature = files.join('|');

  // A shorter proof replacing a longer one would otherwise leave the stage pointing past the end.
  useEffect(() => { setI(0); }, [signature]);

  if (!files.length) return null;

  if (tiles) {
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {files.map((u, n) => (
          <Thumb key={`${u}_${n}`} url={u} size={compact ? 64 : 78}
            onClick={() => onOpen?.(isVideo(u) ? playableVideo(u) : u, isVideo(u) ? 'video' : 'image')}
            title={isVideo(u) ? 'Click to watch' : 'Click to enlarge'} />
        ))}
      </div>
    );
  }

  const many = files.length > 1;
  const url = files[Math.min(i, files.length - 1)];
  const vid = isVideo(url);
  const go = (d) => setI((p) => (p + d + files.length) % files.length);

  const arrow = (dir) => (
    <button type="button" aria-label={dir < 0 ? 'Previous file' : 'Next file'}
      onClick={(e) => { e.stopPropagation(); go(dir); }}
      style={{
        position: 'absolute', top: '50%', transform: 'translateY(-50%)', [dir < 0 ? 'left' : 'right']: 6,
        width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer', zIndex: 2,
        background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 15, lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      {dir < 0 ? '\u2039' : '\u203A'}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {many && (
        <div style={{ fontSize: '0.64rem', color: 'var(--gray)', fontWeight: 600, alignSelf: 'flex-end' }}>
          File {Math.min(i, files.length - 1) + 1} of {files.length}
        </div>
      )}

      <div
        ref={stageRef}
        tabIndex={0}
        onKeyDown={(e) => {
          if (!many) return;
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
          if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
        }}
        style={{
          position: 'relative', height, borderRadius: 10, overflow: 'hidden',
          border: '1px solid var(--border)', outline: 'none', background: '#000',
        }}
      >
        {many && arrow(-1)}
        {many && arrow(1)}

        {vid ? (
          // Controls stay so the clip can be played where it sits; the button below is the way to
          // full size, because a click on the video body belongs to play/pause.
          <video key={url} src={playableVideo(url)} controls playsInline preload="metadata"
            poster={videoPoster(url) ?? undefined}
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        ) : isImage(url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Design file ${i + 1}`}
            onClick={() => onOpen?.(url, 'image')}
            title="Click to view full size"
            style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'zoom-in' }} />
        ) : (
          // A PDF or a source file has nothing to render inline, so offer the only useful action.
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{
              width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 6,
              alignItems: 'center', justifyContent: 'center', color: 'var(--gold)',
              fontWeight: 700, fontSize: '0.78rem', textDecoration: 'none', background: 'var(--dark)',
            }}>
            <span style={{ fontSize: '1.4rem' }}>{'\u2913'}</span>
            Open file
          </a>
        )}

        {vid && (
          <button type="button" onClick={() => onOpen?.(playableVideo(url), 'video')}
            style={{
              position: 'absolute', top: 6, right: 6, zIndex: 2, cursor: 'pointer',
              background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: 6,
              padding: '3px 8px', fontSize: '0.62rem', fontWeight: 700,
            }}>
            Full size
          </button>
        )}
      </div>

      {many && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {files.map((u, n) => {
            const active = n === Math.min(i, files.length - 1);
            return (
              <Thumb key={`${u}_${n}`} url={u} size={compact ? 44 : 54} active={active}
                onClick={() => setI(n)} title={`File ${n + 1}`} />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** One file as a square. Videos show Cloudinary's own still frame with a play mark over it, so the
 *  square is filled without fetching the clip. */
function Thumb({ url, size, active, onClick, title }) {
  const vid = isVideo(url);
  const poster = vid ? videoPoster(url) : null;
  return (
    <button type="button" onClick={onClick} title={title}
      style={{
        width: size, height: size, padding: 0, borderRadius: 7, cursor: 'pointer',
        overflow: 'hidden', background: 'var(--dark)', position: 'relative',
        border: active ? '2px solid var(--gold)' : '1px solid var(--border)',
        opacity: active === false ? 0.65 : 1,
      }}>
      {vid ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {poster ? <img src={cloudinaryThumb(poster, 160)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size > 60 ? 18 : 13, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>{'▶'}</span>
        </>
      ) : isImage(url) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cloudinaryThumb(url, 160)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)', fontSize: '0.55rem', fontWeight: 700 }}>FILE</span>
      )}
    </button>
  );
}
