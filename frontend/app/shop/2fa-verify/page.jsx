'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /shop/2fa-verify is no longer used.
 * 2FA is now handled inline via TwoFactorModal in shop layout.
 * Redirect anyone landing here to /shop.
 */
export default function ShopTwoFactorRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/shop');
  }, [router]);
  return null;
}
