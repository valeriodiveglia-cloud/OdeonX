import LeftNavCRM from '@/components/LeftNavCRM'
import { requireAuth } from '@/lib/auth-check'

export default async function CRMLayout({ children }: { children: React.ReactNode }) {
    await requireAuth()

    return (
        <div className="flex bg-slate-900 min-h-screen">
            <LeftNavCRM />

            <main
                className="flex-1 transition-[padding] duration-150 ease-out"
                style={{ paddingLeft: 'var(--leftnav-w, 3.5rem)' }}
            >
                <div className="min-h-screen bg-gray-50">
                    {children}
                </div>
            </main>
        </div>
    )
}
