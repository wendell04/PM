'use client';

// The old Dashboard. Everything it showed now lives on Home (the owner's view); the address stays
// so bookmarks and old links still land somewhere.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardOverviewMoved() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/business/home'); }, [router]);
  return null;
}
