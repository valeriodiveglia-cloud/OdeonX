// src/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'
import { SettingsProvider } from '@/contexts/SettingsContext'

// Font sans con supporto VI
import { Be_Vietnam_Pro } from 'next/font/google'
// Monospace (puoi tenere Geist_Mono se lo usi)
import { Geist_Mono } from 'next/font/google'

const beVietnam = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'OddsOff',
  description: 'OddsOff — Food costing & operations',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Mostra il badge solo se siamo in dev o preview
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV // 'development' | 'preview' | 'production'
  const showEnvBadge = vercelEnv !== 'production'

  return (
    <html lang="en">
      {/* Applico direttamente il font sans a tutto il body */}
      <body className={`${beVietnam.className} ${geistMono.variable} antialiased`}>
        <SettingsProvider>{children}</SettingsProvider>

        {showEnvBadge && (
          <div className="fixed bottom-2 right-2 text-xs px-2 py-1 rounded bg-black/70 text-white z-50">
            {process.env.NEXT_PUBLIC_SUPABASE_URL
              ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
              : 'env non settato'}
          </div>
        )}
      </body>
    </html>
  )
}
