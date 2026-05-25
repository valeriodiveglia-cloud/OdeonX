import LeftNavEvent from '@/components/LeftNavEvent'
import { EventCalcProvider } from './_state/EventCalcProvider'
import { requireRole } from '@/lib/auth-check'

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireRole(['owner', 'admin', 'manager', 'staff', 'sale advisor'])

  return (
    <EventCalcProvider>
      <div className="min-h-screen flex">
        <LeftNavEvent />
        <main className="flex-1 p-6 bg-white dark:bg-gray-950">
          {children}
        </main>
      </div>
    </EventCalcProvider>
  )
}
