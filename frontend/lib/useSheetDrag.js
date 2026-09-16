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
 * Why it is written the way it is (it used to stutter on a mid-range Android):
 * - One transform write per frame. Touch events arrive faster than the screen redraws; writing on
 *   every one of them queued work the phone could not finish in time.
 * - The sheet is promoted to its own layer only while it is moving (will-change), so moving it is
 *   a compositor job, not a repaint of every image inside it.
 * - Upward drag resists instead of stopping dead at a fixed limit. A hard stop under a moving
 *   finger reads as the phone lagging.
 * - A quick flick counts, not only a long drag - that is how people actually dismiss a sheet.
 *
 * @param {() => void} onClose  called once the sheet has finished sliding away
 * @param {number}     distance how far to drag before it counts as a dismissal
 * @param {() => void} onExpand called when dragged up past the same distance, if given
 */
const FLICK_SPEED = 0.55;   // px per ms
const UP_TRAVEL   = 140;    // how far the sheet can lift, approached but never reached
const EASE        = 'cubic-bezier(0.32,0.72,0,1)';

export default function useSheetDrag(onClose, distance = 90, onExpand = null) {
  const ref   = useRef(null);
  const drag  = useRef(null);   // { y0, t0, lastY, lastT, velocity, shift }
  const frame = useRef(0);

  // The sheet itself is often the thing that scrolls, so it is checked too - stopping one short of
  // it let a notification list scrolled halfway down drag the whole sheet.
  const scrolledInside = (target) => {
    let el = target;
    while (el) {
      if (el.scrollTop > 0) return true;
      if (el === ref.current) break;
      el = el.parentElement;
    }
    return false;
  };

  const paint = () => {
    frame.current = 0;
    const d = drag.current;
    if (d && ref.current) ref.current.style.transform = `translate3d(0, ${d.shift}px, 0)`;
  };

  const settle = (transform, then) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = `transform 0.26s ${EASE}`;
    el.style.transform  = transform;
    let finished = false;
    const done = () => {
      // Both the event and the fallback timer land here; closing the sheet twice would call
      // onClose on something already gone.
      if (finished) return;
      finished = true;
      el.removeEventListener('transitionend', done);
      el.style.willChange = '';
      if (then) then(el);
    };
    el.addEventListener('transitionend', done);
    // transitionend does not fire when nothing moves (already at 0); don't leave the layer promoted.
    setTimeout(done, 320);
  };

  const onTouchStart = (e) => {
    if (scrolledInside(e.target) || !ref.current) { drag.current = null; return; }
    const y = e.touches[0].clientY;
    const t = performance.now();
    drag.current = { y0: y, lastY: y, lastT: t, velocity: 0, shift: 0, target: e.target };
    ref.current.style.transition = 'none';
    ref.current.style.willChange = 'transform';
  };

  const onTouchMove = (e) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    const y  = e.touches[0].clientY;
    const t  = performance.now();
    const dy = y - d.y0;
    if (t > d.lastT) d.velocity = (y - d.lastY) / (t - d.lastT);
    d.lastY = y; d.lastT = t;

    // Reading, not dragging. A thumb that scrolls a list down and then back up in one movement
    // passes through "finger moving down" while the list is still scrolled - that is the list's
    // gesture, so the sheet stays put and the drag is measured again from here if the list
    // reaches its top.
    if (scrolledInside(d.target)) {
      d.y0 = y; d.velocity = 0;
      if (d.shift !== 0) { d.shift = 0; if (!frame.current) frame.current = requestAnimationFrame(paint); }
      return;
    }

    if (dy > 0) d.shift = dy;
    else if (onExpand) d.shift = -UP_TRAVEL * (1 - Math.exp(dy / (UP_TRAVEL * 1.4)));
    else d.shift = 0;

    if (!frame.current) frame.current = requestAnimationFrame(paint);
  };

  const onTouchEnd = (e) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    drag.current = null;
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0; }
    const dy = scrolledInside(d.target) ? 0 : e.changedTouches[0].clientY - d.y0;

    if (dy > distance || (dy > 24 && d.velocity > FLICK_SPEED)) {
      settle('translate3d(0, 110%, 0)', (el) => { el.style.transform = ''; onClose(); });
      return;
    }
    if (onExpand && (dy < -distance || (dy < -24 && d.velocity < -FLICK_SPEED))) {
      // Keep it lifted while the page loads. Dropping it back to rest first and then leaving
      // looked like the sheet changing its mind.
      onExpand();
      return;
    }
    settle('translate3d(0, 0, 0)');
  };

  return { ref, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } };
}
