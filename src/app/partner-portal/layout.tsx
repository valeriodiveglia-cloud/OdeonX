// /src/app/partner-portal/layout.tsx
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
  title: 'Partner Portal — OddsOff',
  description: 'Consulta le tue commissioni, i referral e lo stato dei pagamenti.'
}

export default function PartnerPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${beVietnam.variable} font-sans`}>
      {children}
    </div>
  )
}
