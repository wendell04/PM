import './globals.css'
import '../components/custom-styles.css'
import { AuthProvider } from '../contexts/AuthContext';
import { CartProvider } from '../context/CartContext';

export const metadata = {
  title: 'Personalize Me V2',
  description: 'Personalization platform',
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
