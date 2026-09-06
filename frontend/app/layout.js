import './globals.css'
import '../components/custom-styles.css'
import { AuthProvider } from '../contexts/AuthContext';
import { CartProvider } from '../context/CartContext';
import { ToastProvider } from '../components/Toast';
import { ThemeProvider } from '../contexts/ThemeContext';
import OfflineBanner from '../components/OfflineBanner';

export const metadata = {
  title: 'Personalize Me Prints',
  description: 'Custom printing for t-shirts, mugs, souvenirs, and more. Fast turnaround, bulk pricing, and personalized service.',
  icons: {
    icon: '/logos/PersonalizeMe logo.png',
  },
}

const themeScript = `(function(){var t=localStorage.getItem('pmp-theme')||'light';if(t==='light')document.documentElement.classList.add('light');})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Bundle the brand fonts so every device renders the same (DM Sans = UI, Outfit = logo).
            Without this, devices without these fonts fell back to their system sans-serif. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning={true}>
        <ThemeProvider>
          <AuthProvider>
            <CartProvider>
              <ToastProvider>
                <OfflineBanner />
                {children}
              </ToastProvider>
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
