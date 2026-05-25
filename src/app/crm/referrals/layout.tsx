import { requireRole } from '@/lib/auth-check'

export default async function ReferralsLayout({ children }: { children: React.ReactNode }) {
    await requireRole(['owner', 'admin', 'manager', 'staff'])
    return <>{children}</>
}
