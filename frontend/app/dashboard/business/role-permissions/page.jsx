'use client';
/**
 * Permissions moved into Staff and access (/dashboard/business/access), which replaced this page and
 * its sibling: the ticks live on the person there and a role is only a template. This file stays
 * so old links and bookmarks still land somewhere; it is deleted once Access has been used for a
 * while on real staff.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MovedToAccess() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/business/access'); }, [router]);
  return (
    <div style={{ padding: 24, fontSize: 13, color: 'var(--gray)' }}>
      Permissions is now part of <a href="/dashboard/business/access" style={{ color: 'var(--gold)', fontWeight: 700 }}>Staff and access</a>. Taking you there.
    </div>
  );
}
