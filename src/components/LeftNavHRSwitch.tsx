'use client'

import { usePathname } from 'next/navigation'
import LeftNavHR from './LeftNavHR'
import LeftNavHROperational from './LeftNavHROperational'

export default function LeftNavHRSwitch() {
    const pathname = usePathname()

    if (pathname.startsWith('/human-resources/operational')) {
        return <LeftNavHROperational />
    }

    return <LeftNavHR />
}
