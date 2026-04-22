'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase_shim'

const MAX_RECENT = 6

export default function RecentVisitsTracker() {
  const pathname = usePathname()

  useEffect(() => {
    let ignore = false
    let timeoutId: NodeJS.Timeout;
    
    // Ignore internal routes, api endpoints, or the exact dashboard root page.
    if (!pathname || pathname === '/' || pathname === '/dashboard' || pathname.startsWith('/api') || pathname.startsWith('/auth')) {
      return
    }

    const trackVisit = async () => {
      const { data } = await supabase.auth.getUser()
      if (ignore || !data.user) return

      const userId = data.user.id
      const storageKey = `dashboard.recent.${userId}`
      
      try {
        // Fetch current preferences from DB first to avoid overwriting with stale local state
        const { data: accData } = await supabase
          .from('app_accounts')
          .select('preferences')
          .eq('user_id', userId)
          .single()

        let prefs: any = {}
        let recent: string[] = []

        if (!ignore && accData) {
          prefs = accData.preferences || {}
          recent = prefs.recentVisits || []
        } else {
          // Fallback to local storage if DB fails or ignore is true
          const stored = localStorage.getItem(storageKey)
          recent = stored ? JSON.parse(stored) : []
        }
        
        // Remove the path if it already exists to move it to the top
        recent = recent.filter(p => p !== pathname)
        
        // Add to top
        recent.unshift(pathname)
        
        // Limit to MAX_RECENT
        if (recent.length > MAX_RECENT) {
          recent = recent.slice(0, MAX_RECENT)
        }
        
        localStorage.setItem(storageKey, JSON.stringify(recent))
        
        // We dispatch a custom event to update the dashboard instantly if it's open in another tab or active
        window.dispatchEvent(new Event('recent_visits_updated'))

        // Background sync to Supabase
        if (!ignore && accData) {
          prefs.recentVisits = recent
          await supabase.rpc('update_user_preferences', { prefs })
        }
      } catch (err) {
        // fail silently for localstorage errors
      }
    }

    trackVisit()

    return () => { ignore = true }
  }, [pathname])

  return null
}
