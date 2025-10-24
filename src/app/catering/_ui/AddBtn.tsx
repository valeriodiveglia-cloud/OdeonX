'use client'

import { PlusIcon } from '@heroicons/react/24/outline'

export default function AddBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600/90 hover:bg-green-600 text-white text-sm"
    >
      <PlusIcon className="w-4 h-4" /> {children}
    </button>
  )
}
