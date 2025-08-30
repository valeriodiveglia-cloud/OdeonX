// src/app/(app)/layout.tsx
import LeftNav from '@/components/LeftNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell relative flex min-h-svh bg-transparent">
      <aside
        className="fixed inset-y-0 left-0 z-40 w-14 overflow-visible"
      >
        <LeftNav />
      </aside>

      <main className="flex-1 min-h-svh pl-14">
        <div className="p-4">{children}</div>
      </main>
    </div>
  )
}
