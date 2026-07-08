import { requireRole } from '@/lib/auth-check'

export default async function HROperationalLayout({ children }: { children: React.ReactNode }) {
    await requireRole(['owner', 'admin', 'manager', 'staff', 'sale advisor'])
    return <>{children}</>
}
