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
  title: 'OdeonX',
  description: 'OdeonX - Food costing & operations', // niente em dash
}

// layer fisso dietro a tutta l'app per coprire sempre il viewport
function AppBackground() {
  return <div className="fixed inset-0 -z-50 bg-[#0b1530]" />
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full bg-[#0b1530]">
      {/* bg trasparente: lasciamo lavorare il layer fisso */}
      <body className={`${beVietnam.className} ${geistMono.variable} antialiased min-h-svh bg-transparent`}>
        <AppBackground />
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  )
}
