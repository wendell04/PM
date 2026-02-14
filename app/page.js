'use client';

import dynamic from 'next/dynamic';

// Dynamically import the landing page to avoid SSR issues
const LandingPage = dynamic(() => import('../src/LandingPage'), { ssr: false });

export default function Home() {
  return (
    <LandingPage />
  );
}
