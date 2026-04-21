import { requireRole } from '@/lib/auth-check'

export default async function CommissionsLayout({ children }: { children: React.ReactNode }) {
    await requireRole(['owner', 'admin', 'manager', 'sale advisor'])
    return <>{children}</>
}
