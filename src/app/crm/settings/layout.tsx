import { requireRole } from '@/lib/auth-check'

export default async function CRMSettingsLayout({ children }: { children: React.ReactNode }) {
    await requireRole(['owner', 'admin', 'manager', 'sale advisor'])
    return <>{children}</>
}
