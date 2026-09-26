/**
 * After a save is refused, take the person to what they missed.
 *
 * A long form refused at the bottom while the empty field sits at the top looked like a Save button
 * that does nothing: the red text was off screen. This waits for the errors to render, scrolls the
 * first one to the middle of the screen (inside a modal too - scrollIntoView moves every scrolling
 * parent), and puts the cursor in its field.
 *
 * A field is marked by aria-invalid="true" on the input, or data-field-error on its message.
 */
export function scrollToFirstError(root) {
  if (typeof window === 'undefined') return;
  // Two frames: the first lets React commit the new errors, the second lets layout settle.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const scope = root || document;
    const marks = [...scope.querySelectorAll('[aria-invalid="true"], [data-field-error]')]
      .filter(el => el.offsetParent !== null || el.getClientRects().length);
    if (!marks.length) return;
    // First in reading order, whichever kind of mark it is.
    marks.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const el = marks[0];
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    const isField = n => n && n.matches?.('input, textarea, select, [tabindex], button');
    let input = isField(el) ? el : null;
    // A message: the field is the nearest one before it in the same group.
    // Only its own group (two levels up): further out, "the field before it" is some other field.
    for (let box = el.parentElement, up = 0; !input && box && box !== scope && up < 2; box = box.parentElement, up++) {
      const found = [...box.querySelectorAll('input:not([type=hidden]), textarea, select, button[role=combobox], [role=combobox]')]
        .filter(n => n.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (found.length) input = found[found.length - 1];
    }
    // A message above its table (price tiers): the first red cell in the same section.
    if (!input) {
      const inv = scope.querySelector('[aria-invalid="true"]');
      const section = el.parentElement?.parentElement?.parentElement;
      if (inv && section?.contains(inv)) input = inv;
    }
    try { input?.focus({ preventScroll: true }); } catch { /* not focusable */ }
  }));
}
