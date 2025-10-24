'use client'

import LeftNavEvent from '@/components/LeftNavEvent'
import { EventCalcProvider } from './_state/EventCalcProvider'

export default function Layout({ children }: { children: React.ReactNode }) {
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
