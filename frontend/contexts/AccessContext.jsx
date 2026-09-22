'use client';

import { createContext, useContext } from 'react';

/**
 * One answer, on every dashboard page, to "may this person do X?".
 *
 * The dashboard layout already owns the permission map - it drives the sidebar and the page
 * guard - and provides it here, so a button and the sidebar can never disagree. Pages ask with
 * row keys ('orders.delete', 'stock.work', or a bare row like 'toBuy' for "can open it").
 *
 * Hidden, not disabled: a button someone can never use is noise, and a disabled one invites the
 * question "how do I turn this on?". A button they CAN use but not right now (waiting for a
 * payment) stays, disabled, with the reason. The server checks every action anyway - this is
 * tidiness, not the lock.
 *
 * Outside the provider everything answers yes, which is what every page did before this existed.
 */
const AccessContext = createContext({ can: () => true, owner: true, ready: true });

export function AccessProvider({ value, children }) {
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

/** { can(key | key[]), owner, ready } - a list means "any of these"; `owner` is the owner or
 *  super admin, for the places nobody else may go (Messages, Customers, Staff and access). */
export function useAccess() {
  return useContext(AccessContext);
}

/** Renders its children only when `do` is allowed. */
export function Can({ do: key, children, fallback = null }) {
  const { can } = useContext(AccessContext);
  return can(key) ? children : fallback;
}
