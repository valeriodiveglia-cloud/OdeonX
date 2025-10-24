// src/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'
import 'superdoc/style.css'          // ⬅️ AGGIUNGI QUESTA RIGA
import { SettingsProvider } from '@/contexts/SettingsContext'

// Font…
import { Be_Vietnam_Pro, Geist_Mono } from 'next/font/google'
import ClientErrorGuard from '@/app/dev-error-guard'

const beVietnam = Be_Vietnam_Pro({ subsets: ['vietnamese','latin'], weight: ['400','500','600','700','800'], display: 'swap' })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = { title: 'OddsOff', description: 'OddsOff — Food costing & operations' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV
  const showEnvBadge = vercelEnv !== 'production'

  return (
    <html lang="en">
      <body className={`${beVietnam.className} ${geistMono.variable} antialiased`}>
        <ClientErrorGuard>
          <SettingsProvider>{children}</SettingsProvider>
        </ClientErrorGuard>

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