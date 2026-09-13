import { useEffect } from 'react';

/**
 * Locks the page (body) scroll while `active` is true so the background does not scroll behind an
 * open modal/overlay. Restores the previous value on close. Stacking-safe: nested modals each save
 * and restore the value they found, so closing an inner modal leaves the outer one still locked.
 */
// How many modals are open. A class cannot be removed by the first one to close while a second
// is still up, so the count decides - the same reason the overflow value is saved per modal.
let openModals = 0;

export default function useLockBodyScroll(active) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Marks the page as covered, so anything fixed to the viewport (the chat launcher) can move
    // out of the way instead of floating over the modal's own buttons.
    openModals += 1;
    document.body.classList.add('pmp-modal-open');
    return () => {
      document.body.style.overflow = prev;
      openModals = Math.max(0, openModals - 1);
      if (openModals === 0) document.body.classList.remove('pmp-modal-open');
    };
  }, [active]);
}
