'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import { HiringRequestForm } from '@/components/human-resources/HiringRequestForm'
import { HiringRequest } from '@/types/human-resources'
import CircularLoader from '@/components/CircularLoader'

export default function EditHiringRequestPage() {
    const params = useParams()
    const router = useRouter()
    const [request, setRequest] = useState<HiringRequest | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchRequest = async () => {
            try {
                const { data, error } = await supabase
                    .from('hiring_requests')
                    .select('*')
                    .eq('id', params.id)
                    .single()

                if (error) throw error
                setRequest(data)
            } catch (error) {
                console.error('Error loading request:', error)
                alert('Error loading request')
                router.push('/human-resources/recruitment')
            } finally {
                setLoading(false)
            }
        }

        if (params.id) {
            fetchRequest()
        }
    }, [params.id, router])

    if (loading) return <div className="p-8"><CircularLoader /></div>

    if (!request) return <div className="p-8 text-center">Request not found</div>

    return (
        <div className="min-h-screen text-gray-100 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <header className="mb-6">
                    <div className="flex items-center gap-4">
                        <Link
                            href={`/human-resources/recruitment/${request.id}`}
                            className="p-2 rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition"
                        >
                            <ArrowLeftIcon className="h-5 w-5" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-white sm:text-3xl tracking-tight leading-normal">
                                Edit Hiring Request
                            </h1>
                            <p className="mt-1 text-sm text-slate-400">
                                Update details for {request.position_title}
                            </p>
                        </div>
                    </div>
                </header>

                <main>
                    <HiringRequestForm initialData={request} />
                </main>
            </div>
        </div>
    )
}
