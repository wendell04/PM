// A small preview for a picked file, made without holding the whole picture in memory.
//
// URL.createObjectURL(file) costs nothing by itself, but the <img> that shows it decodes the FULL
// picture - a 12 MP phone photo is ~48 MB of pixels once decoded - and keeps it alive for as long as
// the tile is on screen. Do that for a 40px tile on a mid-range Android while an upload is running
// and the browser discards the tab; the customer is dropped back on the page's loading skeleton with
// their choices gone, which reads as "the upload broke the site".
//
// createImageBitmap resizes during decode where the browser supports it, so the big buffer never
// exists. What is kept afterwards is a ~96px JPEG.

const EDGE    = 96;
const QUALITY = 0.7;

/**
 * Returns an object URL for a small preview, or null when the file is not an image the browser can
 * draw (PDF, AI, PSD - those get an icon instead). Never throws, and never returns the original
 * full-size blob URL for a bitmap: falling back to that is what this exists to avoid.
 */
export async function makeThumbnail(file) {
  try {
    if (!file?.type?.startsWith('image/')) return null;
    // Vectors are already small and lose their shape through a canvas.
    if (/svg/i.test(file.type)) return URL.createObjectURL(file);
    if (typeof createImageBitmap !== 'function') return null;

    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { resizeWidth: EDGE, resizeQuality: 'low' });
    } catch {
      // Safari ignores the resize options on some versions; a plain decode still beats keeping the
      // file alive behind an <img>, because the bitmap is closed a few lines below.
      bitmap = await createImageBitmap(file);
    }

    const scale  = Math.min(1, EDGE / Math.max(bitmap.width, bitmap.height, 1));
    const canvas = document.createElement('canvas');
    canvas.width  = Math.max(1, Math.round(bitmap.width  * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close?.(); return null; }
    // A transparent PNG would go black on a JPEG without a ground under it.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', QUALITY));
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}
