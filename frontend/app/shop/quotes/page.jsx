import { redirect } from 'next/navigation';

// Quotes are no longer a separate list — to a customer a quote is just the first stage of
// an order, so they live in My Orders (bucketed under "To Pay" / "In Progress"). Kept as a
// redirect because older chat notifications and bookmarks still point here.
export default function MyQuotesPage() {
  redirect('/shop/orders-history');
}
