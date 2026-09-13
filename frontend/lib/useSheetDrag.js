import { useRef } from 'react';

/**
 * Drag a bottom sheet down to dismiss it.
 *
 * Every sheet on a phone shows a grab handle, and most of them could not be grabbed - the handle
 * promised something the sheet did not do. This is that behaviour in one place, so the filter
 * sheet, the quick view and anything added later all answer a thumb the same way.
 *
 * The sheet follows the finger downward only: dragging up on a sheet means reading it, not moving
 * it. Past the threshold it finishes the journey and closes; short of it, it springs back. A drag
 * that starts inside something already scrolled (a list mid-scroll) is left alone, or the sheet
 * would slide away while someone is reading it.
 *
 * A sheet may also be dragged UP. Where that is given a meaning - the quick view opening the full
 * product page - the sheet is a preview, and pulling it past the top is asking for the whole thing.
 * Without an onExpand, up does nothing, which is what reading a sheet needs.
 *
 * @param {() => void} onClose  called once the sheet has finished sliding away
 * @param {number}     distance how far to drag before it counts as a dismissal
 * @param {() => void} onExpand called when dragged up past the same distance, if given
 */
export default function useSheetDrag(onClose, distance = 90, onExpand = null) {
  const ref   = useRef(null);
  const start = useRef(null);

  const scrolledInside = (target) => {
    let el = target;
    while (el && el !== ref.current) {
      if (el.scrollTop > 0) return true;
      el = el.parentElement;
    }
    return false;
  };

  const onTouchStart = (e) => {
    if (scrolledInside(e.target)) { start.current = null; return; }
    start.current = e.touches[0].clientY;
  };

  const onTouchMove = (e) => {
    if (start.current == null || !ref.current) return;
    const dy = e.touches[0].clientY - start.current;
    // Upward drags only follow the finger where up means something, and then only a little: the
    // sheet lifts to show it heard you, it does not climb the screen.
    if (dy <= 0 && !onExpand) return;
    const shift = dy > 0 ? dy : Math.max(dy, -48);
    ref.current.style.transition = 'none';
    ref.current.style.transform  = `translateY(${shift}px)`;
  };

  const onTouchEnd = (e) => {
    if (start.current == null || !ref.current) return;
    const dy = e.changedTouches[0].clientY - start.current;
    start.current = null;
    ref.current.style.transition = 'transform 0.24s cubic-bezier(0.32,0.72,0,1)';
    if (dy > distance) {
      ref.current.style.transform = 'translateY(110%)';
      const el = ref.current;
      setTimeout(() => { if (el) el.style.transform = ''; onClose(); }, 220);
      return;
    }
    if (onExpand && dy < -distance) {
      ref.current.style.transform = 'translateY(0)';
      onExpand();
      return;
    }
    ref.current.style.transform = 'translateY(0)';
  };

  return { ref, handlers: { onTouchStart, onTouchMove, onTouchEnd } };
}
