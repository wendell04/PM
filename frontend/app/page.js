import LandingPage from '@/components/LandingPage';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

async function fetchJSON(url) {
  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function Index() {
  const [products, collections, reviews] = await Promise.all([
    fetchJSON(`${BACKEND_URL}/api/products?slim=true`),
    fetchJSON(`${BACKEND_URL}/api/storefront/collections`),
    fetchJSON(`${BACKEND_URL}/api/storefront/reviews?limit=12`),
  ]);

  return (
    <LandingPage
      initialProducts={products?.data ?? []}
      initialCollections={collections?.data ?? []}
      initialReviews={reviews?.data?.reviews ?? []}
    />
  );
}
