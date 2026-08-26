'use client';

import { useEffect, useRef } from 'react';

/**
 * Keep a chat pane pinned to its newest message.
 *
 * Setting scrollTop once is not enough, and a single extra animation frame was not enough either. The
 * pane's height keeps changing after the effect runs, for several independent reasons: the widget
 * animates open, order-card thumbnails finish loading, fonts swap. Each one grows the content
 * underneath a scroll position that was correct when it was set, which is what left the pane sitting
 * on "BEGINNING OF CONVERSATION".
 *
 * So it re-pins over a short window - next frame, then 120ms, 350ms and 700ms - and again whenever a
 * still-loading image finishes. Cheap, and it covers every cause without having to detect which one.
 *
 * It does NOT hijack someone reading back through history: once the user has scrolled up out of the
 * bottom zone, the timed retries stand down. A genuinely new message or a thread switch always wins,
 * because that is a deliberate change the reader asked for.
 */
const BOTTOM_ZONE = 120;

export function useScrollToLatest(ref, deps = []) {
  const stickRef = useRef(true);

  // Track whether the reader is at the bottom, so retries know to leave them alone.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickRef.current = distance <= BOTTOM_ZONE;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const pin = (force = false) => {
      if (!force && !stickRef.current) return;
      el.scrollTop = el.scrollHeight;
    };

    // The dependency changed - a new message, or a different thread. Always obey it.
    stickRef.current = true;
    pin(true);

    const frame = requestAnimationFrame(() => pin(true));
    const timers = [120, 350, 700].map(ms => setTimeout(() => pin(), ms));

    // Only images still in flight; a loaded one will never fire `load` again.
    const pending = Array.from(el.querySelectorAll('img')).filter(img => !img.complete);
    const onSettle = () => pin();
    pending.forEach(img => {
      img.addEventListener('load', onSettle);
      img.addEventListener('error', onSettle);
    });

    return () => {
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      pending.forEach(img => {
        img.removeEventListener('load', onSettle);
        img.removeEventListener('error', onSettle);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
