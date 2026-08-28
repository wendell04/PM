// A proof the customer can look at but cannot use.
//
// The design fee buys the designer's time; the artwork itself is not handed over until the order is
// paid. Nothing stops a customer screenshotting an approved proof and taking it to a cheaper printer -
// no payment rule prevents that, because it is not a payment problem. What prevents it is sending a
// copy that is no good for printing.
//
// Two things do the work, and the second matters more than the first:
//
//   1. A visible mark, so there is no ambiguity that this is a proof and not the deliverable.
//   2. A capped resolution. A 900px-wide JPEG looks fine on a phone and prints badly at any real size.
//      This is the actual protection; the text is mostly there to make the intent explicit.
//
// Applied ONLY where the customer sees the proof. The shop's own screens and the Job Order get the
// original, because production has to work from the real file and QC has to inspect it.

const CLOUDINARY = /res\.cloudinary\.com/;
const UPLOAD = '/upload/';
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i;

// Cloudinary reads transformations from the path segment right after /upload/. Text overlays take the
// text URL-encoded, so a space has to be %20 - a literal space breaks the whole URL.
const IMAGE_TX = [
  'w_900,c_limit',                                   // the real deterrent
  'q_auto:eco',
  // Mid-grey, not white: a white mark at low opacity disappeared entirely on the white mug mockups
  // that make up most proofs. Grey is the only single value that reads on both light and dark artwork.
  'l_text:Arial_52_bold:PROOF%20ONLY,co_rgb:9a9a9a,o_42,a_-30',
  'fl_layer_apply,g_center',
].join('/');

const VIDEO_TX = [
  'w_720,c_limit',
  'q_auto:eco',
].join('/');

/**
 * Returns a display-safe copy of a proof URL. Anything not served by Cloudinary, or already carrying
 * a transformation, is returned untouched rather than guessed at.
 */
export function watermarkedProof(url) {
  if (!url || typeof url !== 'string') return url;
  if (!CLOUDINARY.test(url) || !url.includes(UPLOAD)) return url;

  // Already transformed - do not stack a second set on top.
  if (/\/upload\/(w_|q_|l_text|f_|vc_)/.test(url)) return url;

  // A raw asset - PDF, AI, PSD - is served byte-for-byte and accepts no transformation. Its URL still
  // contains /upload/, so without this the resize and the overlay get spliced into a path Cloudinary
  // rejects, and a proof that was merely unprotected becomes a proof that will not open at all.
  //
  // The honest consequence: a PDF proof goes out at full resolution with no mark on it. There is no
  // way to downscale one here, so if that matters the shop should send a JPEG preview for approval
  // and keep the PDF for production.
  if (/\/raw\/upload\//.test(url)) return url;

  const tx = VIDEO_EXT.test(url) ? VIDEO_TX : IMAGE_TX;
  return url.replace(UPLOAD, `${UPLOAD}${tx}/`);
}

export function watermarkProofs(urls) {
  return (urls ?? []).filter(Boolean).map(watermarkedProof);
}
