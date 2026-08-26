import { useEffect } from 'react';

/**
 * Locks the page (body) scroll while `active` is true so the background does not scroll behind an
 * open modal/overlay. Restores the previous value on close. Stacking-safe: nested modals each save
 * and restore the value they found, so closing an inner modal leaves the outer one still locked.
 */
export default function useLockBodyScroll(active) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [active]);
}
