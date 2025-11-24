import { requireAuth } from '@/lib/auth-check'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    await requireAuth()
    return <>{children}</>
}
