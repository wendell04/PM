// Cloudinary refuses an image over 10 MB on this plan, and a phone photo or a flattened mockup is
// often just over it (a 10.9 MB PNG proof failed to send). An image under the limit is sent as it
// is, untouched; only one over it is re-encoded - WebP first, which keeps transparency, JPEG on a
// white ground where the browser cannot write WebP - stepping quality and then size down until it
// fits. Videos and anything that is not a raster image are returned as they are.
export const IMAGE_LIMIT = 9.5 * 1024 * 1024;

const encode = (canvas, type, quality) => new Promise(res => canvas.toBlob(b => res(b), type, quality));

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function shrinkImageUnder(file, maxBytes = IMAGE_LIMIT) {
  if (!file?.type?.startsWith('image/') || file.size <= maxBytes || /gif|svg/i.test(file.type)) return file;

  const bmp = await loadBitmap(file);
  const w0 = bmp.width, h0 = bmp.height;
  // A proof is looked at, not printed from: past 6000 px on the long side adds weight and nothing seen.
  let scale = Math.min(1, 6000 / Math.max(w0, h0));
  let quality = 0.92;
  let type = 'image/webp';

  for (let i = 0; i < 12; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    const ctx = canvas.getContext('2d');
    if (type === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);

    let blob = await encode(canvas, type, quality);
    // Safari writes PNG when asked for WebP; JPEG then, which every browser can write.
    if (blob && type === 'image/webp' && blob.type !== 'image/webp') { type = 'image/jpeg'; continue; }
    if (blob && blob.size <= maxBytes) {
      const ext = type === 'image/webp' ? 'webp' : 'jpg';
      const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext;
      return new File([blob], name, { type, lastModified: Date.now() });
    }
    if (quality > 0.8) quality = Math.max(0.8, quality - 0.06);
    else scale *= 0.85;
  }
  return file; // could not get under; the server then explains the limit
}
