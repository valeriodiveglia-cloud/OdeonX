'use client'

import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { HiringRequestForm } from '@/components/human-resources/HiringRequestForm'

export default function NewHiringRequestPage() {
    return (
        <div className="min-h-screen bg-slate-900 text-gray-100 p-4">
            <div className="max-w-5xl mx-auto mb-6">
                <div className="flex items-center gap-4">
                    <Link
                        href="/human-resources/recruitment"
                        className="p-2 rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition"
                    >
                        <ArrowLeftIcon className="h-5 w-5" />
                    </Link>
                    <div>
                        <h2 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">
                            New Hiring Request
                        </h2>
                    </div>
                </div>
            </div>

            <main className="max-w-5xl mx-auto">
                <HiringRequestForm />
            </main>
        </div>
    )
}
