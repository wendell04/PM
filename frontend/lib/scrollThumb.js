// Modal scroll areas hide the native scrollbar - it took width on one side only, so the form sat
// off centre - and draw a thin thumb instead that shows while scrolling and fades once it stops.
const SELECTOR = '.auth-modal-body, .tnc-content';
const HIDE_AFTER_MS = 900;
let installed = false;

function place(el, thumb) {
  const range = el.scrollHeight - el.clientHeight;
  if (range <= 0) return false;
  const h = Math.max(28, (el.clientHeight * el.clientHeight) / el.scrollHeight);
  thumb.style.height = `${h}px`;
  thumb.style.transform = `translateY(${el.offsetTop + (el.scrollTop / range) * (el.clientHeight - h)}px)`;
  return true;
}

function onScroll(e) {
  const el = e.target;
  if (!(el instanceof Element) || !el.matches(SELECTOR) || !el.parentElement) return;
  let thumb = el.pmpThumb;
  if (!thumb || !thumb.isConnected) {
    thumb = document.createElement('div');
    thumb.className = 'pmp-scroll-thumb';
    el.parentElement.appendChild(thumb);
    el.pmpThumb = thumb;
  }
  if (!place(el, thumb)) return;
  thumb.classList.add('is-visible');
  clearTimeout(el.pmpThumbTimer);
  el.pmpThumbTimer = setTimeout(() => thumb.classList.remove('is-visible'), HIDE_AFTER_MS);
}

export default function installScrollThumbs() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('scroll', onScroll, true);
}
