import type { ReactNode } from 'react'
import LeftNavMonthlyReports from '@/components/LeftNavMonthlyReports'
import { requireRole } from '@/lib/auth-check'

export default async function MonthlyReportsLayout({ children }: { children: ReactNode }) {
    await requireRole(['owner', 'admin'])

    return (
        <div className="relative">
            <LeftNavMonthlyReports />
            <main
                className="min-h-screen"
                style={{ paddingLeft: 'var(--leftnav-w, 56px)' }}
            >
                {children}
            </main>
        </div>
    )
}
