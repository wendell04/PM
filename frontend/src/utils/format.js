/**
 * Format number with comma separators (e.g., 10000.00 → 10,000.00)
 * @param {number|string|null|undefined} num - The number to format
 * @returns {string} Formatted number with commas
 */
export function formatNumber(num) {
  if (num === null || num === undefined || num === '') return '';
  const parts = num.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/**
 * Format price with peso sign and comma separators (e.g., 10000 → ₱10,000.00)
 * @param {number|string|null|undefined} num - The price to format
 * @returns {string} Formatted price with peso sign and commas
 */
export function formatPrice(num) {
  if (num === null || num === undefined || num === '') return '';
  return '₱' + formatNumber((parseFloat(num) || 0).toFixed(2));
}
