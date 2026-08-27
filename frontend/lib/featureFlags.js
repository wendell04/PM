// Build-time switches for work that is finished enough to keep but not finished enough to sell.
//
// PLAIN_OR_CUSTOM_ENABLED - "one product, two routes": a customisable product that can also be
// bought undecorated, chosen with two buttons on the storefront.
//
// Turned OFF deliberately. The UI was built; the FULFILMENT was not. A plain line still reached the
// cart marked custom, so it asked for artwork and took a 50% deposit, and a plain sale still
// consumed the whole BOM - transfer paper and ink included - for a bag nobody printed. Finishing it
// means carrying "which route is this line?" through the cart, checkout, order, inventory, job
// order, delivery estimate and reports. Seven places, each able to forget.
//
// The shop gets the same result today with no new code: two products, two BOMs, both BOMs listing
// the SAME blank inventory item so they draw down one shelf. That is also how the trade models it -
// a blank and a decorated item are separate SKUs, not one SKU with a switch.
//
// The feature worth building later is smaller and different: linking related products, so someone
// looking at the plain bag learns the printed one exists. That is the actual value this was
// reaching for, and it costs a fraction as much.
//
// To re-enable: set this true. Nothing else was deleted. Fix the fulfilment path first.
export const PLAIN_OR_CUSTOM_ENABLED = false;
