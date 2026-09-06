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
        {/* No web fonts, by the shop owner's decision. Every font-family in the CSS still names
            Montserrat or Outfit, and with nothing loading them each falls through to the platform's
            own UI face - Segoe UI on Windows, which is the look the shop wants and had been getting
            for months while a CSP rule blocked these files without anybody noticing.

            The cost, written down so it is not a surprise later: a platform face is Roboto on
            Android and SF Pro on iOS, so the site will not look the same on every device. Restoring
            the three lines that were here is all it takes to reverse this. */}
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
