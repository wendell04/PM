/**
 * Has this tab moved inside the shop yet?
 *
 * A "Back" button can only walk history when the step behind us is our own. Neither
 * `history.length` nor the referrer proves that: a tab opened on the new-tab page and then pointed
 * at a product has an entry behind it that is not ours, and going back lands the customer on a
 * blank page instead of the shop. Opening a product in a new tab is how people compare two of them,
 * so this is not a rare path.
 *
 * What is certain is the navigating we did ourselves. The count lives in the module, which is per
 * document, so a reload or a fresh tab starts at zero - and sessionStorage, which Chrome COPIES
 * into a tab opened from another tab, is deliberately not used.
 */
let steps = 0;

/** Called by the shop layout on every route change after the one the tab opened on. */
export function markShopNav() { steps += 1; }

/** True when at least one step behind us in this tab is a page of ours. */
export function canGoBackInApp() { return steps > 0; }
