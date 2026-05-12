'use client';
import { useRouter } from 'next/navigation';
import LandingPage from '@/components/LandingPage';

export default function Index() {
  const router = useRouter();
  return <LandingPage onEnterShop={() => router.push('/shop')} />;
}