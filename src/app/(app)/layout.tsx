// src/app/(app)/layout.tsx
import type { ReactNode } from "react"
import LeftNav from "@/components/LeftNav"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-900">
      <aside
        className="peer group/sidebar fixed inset-y-0 left-0 z-40
                   w-16 hover:w-64 transition-all duration-200
                   bg-[#0B1537] border-r border-white/10"
      >
        <LeftNav />
      </aside>

      <main className="flex-1 min-h-screen pl-16 peer-hover:pl-64 transition-[padding] duration-200">
        <div className="p-4">{children}</div>
      </main>
    </div>
  )
}
