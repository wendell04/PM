// Display-size copies of Cloudinary images.
//
// Artwork is uploaded at print resolution - that is the point of it. The shop then rendered those
// files into 26- and 34-pixel tiles, and into 80-pixel rows in the admin order modal, by handing the
// browser the full original and letting CSS shrink it. A three-megabyte file arriving to fill a
// thumbnail is three megabytes of the shop's Cloudinary allowance spent on a picture nobody can see.
//
// Cloudinary builds a smaller copy on request and caches it. The original is not touched, moved or
// re-encoded; it stays exactly as uploaded, because that is the file that goes to the printer.
//
// NEVER call this on a URL headed for production, a job order, or a download. Only on pixels.

const CLOUDINARY = /res\.cloudinary\.com/;
const UPLOAD = '/upload/';

// Raw assets - PDF, AI, PSD - are served byte-for-byte and accept no transformation. Their URLs still
// contain /upload/, so without this guard the parameters get spliced into a path Cloudinary rejects
// and the thumbnail 404s. There is nothing to shrink in a PDF here anyway.
const RAW = /\/raw\/upload\//;

// Only formats Cloudinary treats as images. A `.pdf` sitting on the image pipeline (anything uploaded
// before the raw fix) is left alone rather than guessed at.
const RESIZABLE = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;

/**
 * A thumbnail-sized copy of a Cloudinary image URL.
 *
 * `f_auto` lets Cloudinary pick the format the requesting browser handles best - usually WebP or AVIF,
 * both far smaller than the JPEG or PNG that was uploaded. `q_auto` picks a quality level per image
 * rather than a fixed number, so a flat logo compresses hard and a photograph does not.
 * `c_limit` only ever shrinks: an image already smaller than the target is passed through rather than
 * blown up into a blurry one.
 *
 * Anything that is not a resizable Cloudinary image comes back untouched. Guessing at a URL this
 * function does not understand would break a working image to save a few kilobytes.
 */
export function cloudinaryThumb(url, width = 200) {
  if (!url || typeof url !== 'string') return url;
  if (!CLOUDINARY.test(url) || !url.includes(UPLOAD)) return url;
  if (RAW.test(url)) return url;
  if (!RESIZABLE.test(url)) return url;

  // Already carries a transformation - the proof watermark, most likely. Stacking a second set on top
  // would override the width cap that watermark exists to enforce.
  if (/\/upload\/(w_|q_|l_text|f_|c_|e_)/.test(url)) return url;

  const w = Math.max(32, Math.min(2000, Math.round(width)));
  return url.replace(UPLOAD, `${UPLOAD}f_auto,q_auto,w_${w},c_limit/`);
}
