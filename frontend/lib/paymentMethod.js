// One answer to "is this cash on delivery", matching the backend's App\Support\PaymentMethod.
//
// The stored paymentMethod is written by several paths with different vocabularies, so six
// screens each compared it to the literal 'cod' and disagreed with each other whenever the
// value arrived spelled any other way. A COD order that reads as prepaid shows the wrong
// badge and the wrong money, so the spelling is decided in one place.
const COD_ALIASES = ['cod', 'cash_on_delivery', 'cash-on-delivery', 'cash on delivery', 'cashondelivery'];

export function isCodMethod(method) {
  return COD_ALIASES.includes(String(method ?? '').trim().toLowerCase());
}
