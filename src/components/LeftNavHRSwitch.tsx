'use client'

import { usePathname } from 'next/navigation'
import LeftNavHR from './LeftNavHR'
import LeftNavHROperational from './LeftNavHROperational'
import LeftNavHRManagement from './LeftNavHRManagement'

export default function LeftNavHRSwitch() {
    const pathname = usePathname()

    if (pathname.startsWith('/human-resources/operational')) {
        return <LeftNavHROperational />
    }

    if (pathname.startsWith('/human-resources/management')) {
        return <LeftNavHRManagement />
    }

    return <LeftNavHR />
}
