import React from 'react'

export function TableContainer({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white shadow-md border border-gray-200/80 overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        {children}
      </div>
    </div>
  )
}

export function Table({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <table className={`w-full border-collapse text-left ${className}`}>
      {children}
    </table>
  )
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      {children}
    </thead>
  )
}

export function TableHeadRow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <tr className={`bg-gray-50/75 border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-slate-500 ${className}`}>
      {children}
    </tr>
  )
}

export function TableBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <tbody className={`divide-y divide-gray-100 bg-white ${className}`}>
      {children}
    </tbody>
  )
}

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode
  onClick?: () => void
}

export function TableRow({
  children,
  onClick,
  className = '',
  ...props
}: TableRowProps) {
  return (
    <tr
      onClick={onClick}
      className={`group hover:bg-slate-50/80 transition-colors duration-150 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      {...props}
    >
      {children}
    </tr>
  )
}

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode
}

export function TableCell({
  children,
  className = '',
  colSpan,
  onClick,
  ...props
}: TableCellProps) {
  return (
    <td
      colSpan={colSpan}
      onClick={onClick}
      className={`px-6 py-4 text-sm text-slate-600 ${className}`}
      {...props}
    >
      {children}
    </td>
  )
}
