import LeftNavLoyaltyManager from '@/components/LeftNavLoyaltyManager'
import { requireAuth } from '@/lib/auth-check'

export default async function LoyaltyManagerLayout({
    children,
}: {
    children: React.ReactNode
}) {
    await requireAuth()

    // Lasciamo che la leftnav imposti --leftnav-w. Qui usiamo padding-left su tutta la sezione.
    return (
        <div className="relative">
            <LeftNavLoyaltyManager />
            <main
                className="min-h-screen"
                style={{ paddingLeft: 'var(--leftnav-w, 56px)' }}
            >
                {children}
            </main>
        </div>
    )
}
