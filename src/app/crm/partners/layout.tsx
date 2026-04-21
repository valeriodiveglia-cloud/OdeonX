import { requireRole } from '@/lib/auth-check'

export default async function PartnersLayout({ children }: { children: React.ReactNode }) {
    await requireRole(['owner', 'admin', 'manager', 'sale advisor'])
    return <>{children}</>
}
