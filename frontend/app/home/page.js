'use client';

import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  // TODO: Implement CustomerHome component
  return (
    <div style={{ padding: '2rem', color: 'white' }}>
      <h1>Customer Home - Coming Soon</h1>
      <button onClick={() => router.push('/')} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
        Back to Landing
      </button>
    </div>
  );
}