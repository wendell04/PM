import './globals.css'
import '../src/custom-styles.css'
import { AuthProvider } from '../src/contexts/AuthContext';

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
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
