'use client'

import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { HiringRequestForm } from '@/components/human-resources/HiringRequestForm'

export default function NewHiringRequestPage() {
    return (
        <div className="min-h-screen text-gray-100 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <header className="mb-6">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/human-resources/recruitment"
                            className="p-2 rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition"
                        >
                            <ArrowLeftIcon className="h-5 w-5" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-white sm:text-3xl tracking-tight leading-normal">
                                New Hiring Request
                            </h1>
                            <p className="mt-1 text-sm text-slate-400">
                                Create a new job vacancy request for review and posting.
                            </p>
                        </div>
                    </div>
                </header>

                <main>
                    <HiringRequestForm />
                </main>
            </div>
        </div>
    )
}
