import './globals.css'
import '../components/custom-styles.css'
import { AuthProvider } from '../contexts/AuthContext';
import { CartProvider } from '../context/CartContext';

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
            {children}
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
