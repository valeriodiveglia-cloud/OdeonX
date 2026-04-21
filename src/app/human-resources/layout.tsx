import LeftNavHRSwitch from '@/components/LeftNavHRSwitch'
import { requireAuth } from '@/lib/auth-check'

export default async function HRLayout({ children }: { children: React.ReactNode }) {
    await requireAuth()

    return (
        <div className="relative">
            <LeftNavHRSwitch />

            {/* 
         The sidebar manages a CSS variable --leftnav-w.
         We use padding-left to push content.
      */}
            <main
                className="min-h-screen transition-[padding] duration-150 ease-out"
                style={{ paddingLeft: 'var(--leftnav-w, 3.5rem)' }}
            >
                {children}
            </main>
        </div>
    )
}
