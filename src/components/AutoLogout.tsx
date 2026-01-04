'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase_shim'

const TIMEOUT_MS = 60 * 60 * 1000 // 1 hour

export default function AutoLogout() {
    const router = useRouter()
    const timerRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        const resetTimer = () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            timerRef.current = setTimeout(async () => {
                console.log('AutoLogout: Session expired due to inactivity.')
                await supabase.auth.signOut()
                router.push('/login?reason=timeout')
            }, TIMEOUT_MS)
        }

        // Set initial timer
        resetTimer()

        const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart']
        const handler = () => resetTimer()

        events.forEach((event) => {
            window.addEventListener(event, handler)
        })

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            events.forEach((event) => {
                window.removeEventListener(event, handler)
            })
        }
    }, [router])

    return null
}
