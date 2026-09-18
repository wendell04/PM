import { useEffect } from 'react';
import installScrollThumbs from '@/lib/scrollThumb';

/**
 * Locks the page behind an open modal.
 *
 * `body { overflow: hidden }` alone is not a scroll lock on a phone: iOS Safari ignores it outright
 * and several Android skins keep scrolling the document under the overlay, which is how a modal ends
 * up floating over a page that slides around behind it. The reliable way is to take the body out of
 * the flow at its current offset - then there is nothing left to scroll - and put the page back
 * exactly where it was on close.
 *
 * Stacking-safe: only the first modal captures the position and only the last one restores it, so a
 * modal opened from inside another does not release the page early.
 */
let openModals = 0;
let saved = null;

export default function useLockBodyScroll(active) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    installScrollThumbs();

    if (openModals === 0) {
      const body = document.body;
      const y = window.scrollY || window.pageYOffset || 0;
      // The scrollbar vanishes with the scroll; on a desktop that shifts the whole page left by its
      // width. Hold the space it occupied.
      const gap = window.innerWidth - document.documentElement.clientWidth;
      saved = {
        y,
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflow: body.style.overflow,
        paddingRight: body.style.paddingRight,
      };
      body.style.position = 'fixed';
      body.style.top = `-${y}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      if (gap > 0) body.style.paddingRight = `${gap}px`;
    }

    // Marks the page as covered, so anything fixed to the viewport (the chat launcher, the phone tab
    // bar) can move out of the way instead of floating over the modal's own buttons.
    openModals += 1;
    document.body.classList.add('pmp-modal-open');

    return () => {
      openModals = Math.max(0, openModals - 1);
      if (openModals > 0) return;
      document.body.classList.remove('pmp-modal-open');
      if (!saved) return;
      const body = document.body;
      body.style.position     = saved.position;
      body.style.top          = saved.top;
      body.style.left         = saved.left;
      body.style.right        = saved.right;
      body.style.width        = saved.width;
      body.style.overflow     = saved.overflow;
      body.style.paddingRight = saved.paddingRight;
      // Jumping back has to happen after the styles are off, or the browser clamps it to 0.
      window.scrollTo(0, saved.y);
      saved = null;
    };
  }, [active]);
}
