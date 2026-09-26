/**
 * Is the address being paid with the place the quote's delivery fee was priced for?
 *
 * The same rule as the server's App\Support\DeliverTo::check - that one decides, this one lets
 * the checkout say so before the customer presses Pay. Change them together.
 *
 *   'match'  - same saved address, or the same barangay and city
 *   'differs'- a saved address was priced and this is somewhere else
 *   'unsure' - a written address was priced and we cannot read it as this one
 */

const norm = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/\b(brgy|barangay|bgy)\b\.?/g, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// "City of Marikina", "Marikina City" and "Marikina" are one place.
const city = (s) => norm(s).replace(/^city of /, '').replace(/ city$/, '').trim();

export function deliverToCheck(priced, address) {
  if (!priced || !address) return 'match';
  if (priced.source === 'saved') {
    if (address.id && String(address.id) === String(priced.addressId ?? '')) return 'match';
    const b = norm(priced.barangay), c = city(priced.city);
    return b && c && b === norm(address.barangay) && c === city(address.city) ? 'match' : 'differs';
  }
  const text = ` ${norm(priced.text).replace(/metro manila/g, ' ')} `;
  const b = norm(address.barangay), c = city(address.city);
  return b && c && text.includes(` ${b} `) && text.includes(` ${c} `) ? 'match' : 'unsure';
}
