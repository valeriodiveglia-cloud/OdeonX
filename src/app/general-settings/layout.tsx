import { requireAuth } from '@/lib/auth-check'

export default async function GeneralSettingsLayout({ children }: { children: React.ReactNode }) {
    await requireAuth()
    return <>{children}</>
}
