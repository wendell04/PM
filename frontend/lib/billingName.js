// The billing name PayMongo gets with a card. It refuses a blank one outright ("billing.name cannot
// be blank"), and no bank checks it against the card - 3-D Secure does that job. So it is the
// account's own name, and never empty.
//
// The user object carries firstName / lastName, not `name`. Reading `user.name` was the bug: it
// was always undefined, so once the Name on card field went away every card was refused.
export function billingName(user) {
  const full = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return full || String(user?.name || '').trim() || 'Customer';
}
