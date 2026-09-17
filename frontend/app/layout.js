import './globals.css'
import '../components/custom-styles.css'
import { AuthProvider } from '../contexts/AuthContext';
import { CartProvider } from '../context/CartContext';
import { ToastProvider } from '../components/Toast';
import { ThemeProvider } from '../contexts/ThemeContext';
import OfflineBanner from '../components/OfflineBanner';

export const metadata = {
  title: 'Personalize Me Prints',
  // What search engines show under the site name. Only what the shop does - no prices, days or
  // hours, which live in the Homepage CMS and would go stale here.
  description: 'Personalized mugs, totebags, stickers, mousepads, badges, keychains and t-shirt printing. Upload your design or request one, approve a proof, and we print it.',
  icons: {
    icon: '/logos/PersonalizeMe logo.png',
  },
}

const themeScript = `(function(){var t=localStorage.getItem('pmp-theme')||'light';if(t==='light')document.documentElement.classList.add('light');})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Arimo only, and only devices without Arial ever fetch it.

            Measured rather than assumed: probing the live page returned Arial at a width difference
            of 0.0 and Segoe UI at 42.7, so Windows has been rendering Arial. Android has no Arial
            and substitutes Roboto, which is why the phone looked wrong.

            Arimo is metrically identical to Arial - same widths, same line breaks. With Arial first
            in every stack, Windows and iOS match locally and this file is never downloaded there. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Arimo:wght@400;500;600;700&display=swap" rel="stylesheet" />

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
