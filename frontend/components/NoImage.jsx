// The mark shown where a picture would be, when there isn't one.
//
// This existed in five places in four shapes: a picture-frame icon in the shop grid and the admin
// order lines, and the bare words "No image" in the cart, the quote checkout, the carousel and the
// banners list. Two placeholders for one absence read as two different problems - and the words look
// like an error where the icon reads as what it is: nothing uploaded yet. The words are also the
// first thing to become unreadable, because the containers they sit in are 22 to 48 pixels wide.
//
// `label` is for screen readers and is not drawn. `size` is the icon, not the box - the box is
// whatever the caller already has.
export default function NoImage({ size = 22, color = '#9ca3af', label = 'No image' }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
      role="img" aria-label={label}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}
