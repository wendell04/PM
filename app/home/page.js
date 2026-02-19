'use client';
import CustomerHome from '../../src/components/CustomerHome';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  return <CustomerHome onBackToLanding={() => router.push('/')} />;
}