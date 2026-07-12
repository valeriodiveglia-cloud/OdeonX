'use client'

import React from 'react'
import { useSettings } from '@/contexts/SettingsContext'

interface PageHeaderProps {
  title: string
  subtitle?: string
  badgeText?: string
  badgeLoading?: boolean
  lukeLoading?: boolean
  lukeLoadingText?: string
  actions?: React.ReactNode
  left?: React.ReactNode
}

export default function PageHeader({
  title,
  subtitle,
  badgeText,
  badgeLoading,
  lukeLoading,
  lukeLoadingText,
  actions,
  left,
}: PageHeaderProps) {
  const { language } = useSettings()

  return (
    <div className="md:flex md:items-center md:justify-between mb-6 border-b border-slate-800/60 pb-4 no-print">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          {left}
          <h1 className="text-2xl font-bold text-white sm:text-3xl tracking-tight leading-normal">
            {title}
          </h1>

          {(badgeText || badgeLoading) && (
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-600/15 px-3 py-1 text-xs text-blue-100">
              {badgeLoading ? (
                <span>{language === 'vi' ? 'Đang kiểm tra...' : 'Checking...'}</span>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                  <span className="font-medium">{badgeText}</span>
                </>
              )}
            </div>
          )}

          {lukeLoading && (
            <span className="text-xs text-slate-350 font-medium animate-pulse">
              {lukeLoadingText || (language === 'vi' ? 'Đang tải...' : 'Loading...')}
            </span>
          )}
        </div>
        
        {subtitle && (
          <p className="mt-1 text-sm text-slate-400">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div className="mt-4 flex items-center gap-2 md:mt-0 md:ml-4 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
