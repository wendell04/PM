'use client';
import LandingPage from '../src/LandingPage';
import { useRouter } from 'next/navigation';

export default function Index() {
  const router = useRouter();
  return <LandingPage onEnterShop={() => router.push('/home')} />;
}