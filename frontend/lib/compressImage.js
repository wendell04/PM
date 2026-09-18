// Shrinks a picked photo in the browser before it is uploaded.
//
// A phone photo is 3-30 MB and a chat bubble shows it at 260px. Sending the original means the
// server refuses the big ones and every reader downloads twenty times what they can see. Messenger
// has always done this quietly, which is why nobody there has ever met a file size limit.
//
// Reference photos only. Never run this over artwork that will be printed - the whole point of a
// design file is that it arrives byte-identical.

const MAX_EDGE   = 1600;   // plenty for a chat bubble and a full-screen look on a phone
const SKIP_BELOW = 1.5 * 1024 * 1024;
const QUALITY    = 0.82;

function loadBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

/**
 * Returns a File - the compressed one when that is genuinely smaller, otherwise the original.
 * Never throws: anything it cannot handle (HEIC a browser will not decode, an animated GIF, a
 * canvas the browser refuses to export) comes back untouched rather than lost.
 */
export async function compressImage(file) {
  try {
    if (!file || !file.type?.startsWith('image/')) return file;
    // A GIF loses its animation through a canvas, and an SVG is already tiny and not a bitmap.
    if (/gif|svg/i.test(file.type)) return file;

    const img = await loadBitmap(file);
    const { width: w, height: h } = img;
    if (!w || !h) return file;

    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    // Small and already modest: re-encoding would cost quality and save nothing.
    if (scale === 1 && file.size <= SKIP_BELOW) return file;

    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // JPEG has no alpha, so anything transparent would turn black without this.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}
