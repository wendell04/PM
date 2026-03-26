11/**
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

/**
 * Smart format - removes .00 if whole number, adds commas
 * Examples: 2500.00 → "2,500" | 2500.50 → "2,500.50" | 95 → "95"
 * @param {number|string|null|undefined} num - The number to format
 * @returns {string} Formatted number with smart decimal handling
 */
export function formatSmart(num) {
  if (num === null || num === undefined || num === '') return '';
  
  const parsed = parseFloat(num);
  if (isNaN(parsed)) return '';
  
  // Check if it's a whole number (no meaningful decimals)
  if (Number.isInteger(parsed)) {
    return parsed.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  
  // Has decimals - format with commas, remove trailing zeros
  const fixed = parsed.toFixed(2);
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
  // Remove .00 if whole number
  if (parts[1] === '00') {
    return parts[0];
  }
  
  // Remove trailing zero if exists (e.g., 2500.50 → 2,500.5)
  const decimalPart = parts[1].replace(/0$/, '');
  if (decimalPart === '') {
    return parts[0];
  }
  
  return parts.join('.');
}

/**
 * Format price with smart decimal handling (no .00 for whole numbers)
 * Examples: 2500 → "₱2,500" | 2500.50 → "₱2,500.50" | 95 → "₱95"
 * @param {number|string|null|undefined} num - The price to format
 * @returns {string} Formatted price with peso sign and smart decimals
 */
export function formatPriceSmart(num) {
  if (num === null || num === undefined || num === '') return '';
  return '₱' + formatSmart(num);
}
