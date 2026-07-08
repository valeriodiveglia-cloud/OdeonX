// src/app/(app)/layout.tsx
import type { ReactNode } from "react"
import LeftNav from "@/components/LeftNav"
import { requireAuth } from "@/lib/auth-check"
import { redirect } from "next/navigation"
import { supaService } from "@/lib/server/auth"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth()

  const { data: account } = await supaService
    .from('app_accounts')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const role = account?.role || 'staff'
  if (role === 'hr manager') {
    redirect('/human-resources/recruitment')
  }

  return (
    <div className="relative min-h-screen bg-slate-900">
      <LeftNav />
      <main
        className="flex-1 min-h-screen transition-[padding] duration-150 ease-out"
        style={{ paddingLeft: 'var(--leftnav-w, 3.5rem)' }}
      >
        <div className="p-4">{children}</div>
      </main>
    </div>
  )
}
