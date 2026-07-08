'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PostingPlatformsPageRedirect() {
    const router = useRouter()
    useEffect(() => {
        router.replace('/human-resources/settings')
    }, [router])

    return null
}
