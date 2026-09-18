import LandingPage from '@/components/LandingPage';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

async function fetchJSON(url) {
  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function Index() {
  // The phone-layout switch is read here, not in the browser, so the page never paints the old
  // layout first and swap. Off (or unreachable) keeps the layout that shipped before it.
  const [products, collections, reviews, layout] = await Promise.all([
    fetchJSON(`${BACKEND_URL}/api/products?slim=true`),
    fetchJSON(`${BACKEND_URL}/api/storefront/collections`),
    fetchJSON(`${BACKEND_URL}/api/storefront/reviews?limit=12`),
    fetchJSON(`${BACKEND_URL}/api/storefront/content/homepage_layout`),
  ]);

  return (
    <LandingPage
      initialProducts={products?.data ?? []}
      initialCollections={collections?.data ?? []}
      initialReviews={reviews?.data?.reviews ?? []}
      mobileV2={layout?.data?.mobileV2 === true}
    />
  );
}
