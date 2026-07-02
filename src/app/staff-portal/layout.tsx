// /src/app/staff-portal/layout.tsx
import type { Metadata } from 'next'
import '../globals.css'
import { Be_Vietnam_Pro } from 'next/font/google'

const beVietnam = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-be-vietnam'
})

export const metadata: Metadata = {
  title: 'Staff Portal — OddsOff',
  description: 'Visualizza il tuo roster, contratti, asset, performance e service charge.'
}

export default function StaffPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${beVietnam.variable} font-sans min-h-screen bg-slate-50 text-slate-800`}>
      {children}
    </div>
  )
}
