import './globals.css'
import '../components/custom-styles.css'
import { AuthProvider } from '../contexts/AuthContext';
import { CartProvider } from '../context/CartContext';
import { ToastProvider } from '../components/Toast';
import OfflineBanner from '../components/OfflineBanner';

export const metadata = {
  title: 'Personalize Me Prints',
  description: 'Custom printing for t-shirts, mugs, souvenirs, and more. Fast turnaround, bulk pricing, and personalized service.',
  icons: {
    icon: '/logos/PersonalizeMe logo.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning={true}>
        <AuthProvider>
          <CartProvider>
            <ToastProvider>
              <OfflineBanner />
              {children}
            </ToastProvider>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
