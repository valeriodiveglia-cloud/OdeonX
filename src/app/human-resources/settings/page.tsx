'use client'

import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { GlobeAltIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'

const SETTINGS_SECTIONS = [
    {
        title: 'Posting Platforms',
        description: 'Add, edit or remove the platforms available for logging job postings.',
        icon: GlobeAltIcon,
        href: '/human-resources/settings/posting-platforms',
    },
    // Future sections can be added here
    // {
    //     title: 'Email Templates',
    //     description: 'Manage email templates for recruitment communications.',
    //     icon: EnvelopeIcon,
    //     href: '/human-resources/settings/email-templates',
    // },
]

export default function HRSettingsPage() {
    return (
        <div className="min-h-screen">
            <header className="border-b border-white/10">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/human-resources"
                            className="p-2 rounded-full hover:bg-white/10 transition"
                        >
                            <ArrowLeftIcon className="h-5 w-5 text-gray-300" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-white sm:text-3xl sm:tracking-tight flex items-center gap-3">
                                <Cog6ToothIcon className="h-7 w-7 text-gray-400" />
                                HR Settings
                            </h1>
                            <p className="mt-1 text-sm text-gray-400">
                                Configure recruitment platforms and other HR preferences.
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid gap-4 sm:grid-cols-2">
                    {SETTINGS_SECTIONS.map((section) => (
                        <Link
                            key={section.href}
                            href={section.href}
                            className="bg-white shadow sm:rounded-2xl border border-gray-200 p-6 hover:shadow-lg hover:border-blue-200 transition group"
                        >
                            <div className="flex items-start gap-4">
                                <div className="p-3 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition">
                                    <section.icon className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-700 transition">
                                        {section.title}
                                    </h3>
                                    <p className="mt-1 text-sm text-gray-500">
                                        {section.description}
                                    </p>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </main>
        </div>
    )
}
