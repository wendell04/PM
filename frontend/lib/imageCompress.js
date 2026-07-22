/**
 * Downscale + re-encode an image file so it always fits the API upload limit.
 *
 * The backend caps uploads at 5 MB (/api/admin/upload-image) and 2 MB
 * (/api/profile/upload-avatar). Phone photos routinely exceed both, so anything
 * that skips the cropper (bulk multi-select, clipboard paste) is compressed here
 * first - the owner never has to think about file size.
 *
 * Returns the original File untouched when it's already small enough, so small
 * uploads keep their original quality/format.
 */
export async function compressImage(file, { maxDim = 2000, quality = 0.85, maxBytes = 4 * 1024 * 1024 } = {}) {
  if (!file || !file.type?.startsWith('image/')) return file;
  if (file.size <= maxBytes) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new window.Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });

    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';        // flatten transparency so JPEG doesn't go black
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // Step the quality down until it fits; give up gracefully rather than loop forever.
    let q = quality;
    for (let i = 0; i < 4; i++) {
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', q));
      if (!blob) break;
      if (blob.size <= maxBytes || q <= 0.5) {
        return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
      }
      q -= 0.15;
    }
    return file;
  } catch {
    return file;                      // never block an upload because compression failed
  } finally {
    URL.revokeObjectURL(url);
  }
}
