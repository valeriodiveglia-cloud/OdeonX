// app/daily-reports/layout.tsx
import type { ReactNode } from 'react'
import LeftNavDailyReports from '@/components/LeftNavDailyReports'

export default function DailyReportsLayout({ children }: { children: ReactNode }) {
  // Lasciamo che la leftnav imposti --leftnav-w. Qui usiamo padding-left su tutta la sezione.
  return (
    <div className="relative">
      <LeftNavDailyReports />
      <main
        className="min-h-screen"
        style={{ paddingLeft: 'var(--leftnav-w, 56px)' }}
      >
        {children}
      </main>
    </div>
  )
}