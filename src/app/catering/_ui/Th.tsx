'use client'

export default function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`text-left px-3 py-2 ${className}`}>{children}</th>
}
