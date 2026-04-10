'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';

export default function DashboardLayout({ children }) {
  // This is a wrapper layout - child routes have their own layouts
  return <>{children}</>;
}