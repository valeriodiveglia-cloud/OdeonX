import { requireRole } from '@/lib/auth-check'

export default async function TasksLayout({ children }: { children: React.ReactNode }) {
    await requireRole(['owner', 'admin', 'manager'])
    return <>{children}</>
}
