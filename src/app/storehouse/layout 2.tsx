import React from 'react'
import LeftNavStorehouse from '@/components/LeftNavStorehouse'
import { requireAuth } from '@/lib/auth-check'

export default async function StorehouseLayout({ children }: { children: React.ReactNode }) {
  // Controlla la sessione dell'utente prima di caricare il modulo
  await requireAuth()

  return (
    <div className="flex bg-slate-900 min-h-screen text-slate-100">
      {/* Sidebar specifica per lo Storehouse */}
      <LeftNavStorehouse />

      {/* Area principale del modulo */}
      <main
        className="flex-1 transition-[padding] duration-150 ease-out bg-slate-900"
        style={{ paddingLeft: 'var(--leftnav-w, 3.5rem)' }}
      >
        {/* Sfondo scuro e testo chiaro per perfetta coerenza con il modulo Costing */}
        <div className="min-h-screen p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
