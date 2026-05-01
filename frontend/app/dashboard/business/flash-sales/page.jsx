'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FlashSalesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/business/promotions?tab=flash_sales'); }, [router]);
  return null;
}
