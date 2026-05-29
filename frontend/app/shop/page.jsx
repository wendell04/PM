import { Suspense } from 'react';
import ShopClient from './ShopClient';

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

export default async function ShopPage({ searchParams }) {
  const params = await searchParams;
  const collection = params?.collection ?? null;

  const [products, collections, banners, flashSalesRes] = await Promise.all([
    fetchJSON(`${BACKEND_URL}/api/products?slim=true`),
    fetchJSON(`${BACKEND_URL}/api/storefront/collections`),
    fetchJSON(`${BACKEND_URL}/api/storefront/banners?context=shop`),
    fetchJSON(`${BACKEND_URL}/api/storefront/flash-sales`),
  ]);

  const flashSalesMap = {};
  (flashSalesRes?.data ?? []).forEach(sale => {
    if (sale.productId) flashSalesMap[sale.productId] = sale;
  });

  return (
    <Suspense>
      <ShopClient
        initialProducts={products?.data ?? []}
        initialCollections={collections?.data ?? []}
        initialBanners={banners?.data ?? []}
        initialFlashSales={flashSalesMap}
        initialCollection={collection}
      />
    </Suspense>
  );
}
