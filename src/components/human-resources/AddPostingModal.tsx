'use client'

import { useState, useEffect, Fragment } from 'react'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import { RecruitmentPlatform } from '@/types/human-resources'

interface PlatformOption {
    value: string
    label: string
    icon: string
}

interface AddPostingModalProps {
    hiringRequestId: string
    positionTitle: string
    onClose: () => void
    onSuccess: () => void
}

export function AddPostingModal({ hiringRequestId, positionTitle, onClose, onSuccess }: AddPostingModalProps) {
    const [submitting, setSubmitting] = useState(false)
    const [platforms, setPlatforms] = useState<PlatformOption[]>([])
    const [formData, setFormData] = useState({
        platform: '',
        platform_url: '',
        notes: ''
    })

    useEffect(() => {
        const fetchPlatforms = async () => {
            try {
                const { data, error } = await supabase
                    .from('recruitment_platforms')
                    .select('value, label, icon')
                    .order('sort_order', { ascending: true })

                if (error) throw error
                const items = (data || []) as PlatformOption[]
                setPlatforms(items)
                if (items.length > 0) {
                    setFormData(prev => ({ ...prev, platform: items[0].value }))
                }
            } catch (error) {
                console.error('Error fetching platforms:', error)
            }
        }
        fetchPlatforms()
    }, [])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)

        try {
            const { error } = await supabase
                .from('recruitment_postings')
                .insert([{
                    hiring_request_id: hiringRequestId,
                    platform: formData.platform,
                    platform_url: formData.platform_url || null,
                    notes: formData.notes || null,
                    status: 'active',
                    responses_count: 0,
                }])

            if (error) throw error

            // Log activity
            await supabase.from('hr_activity_log').insert([{
                hiring_request_id: hiringRequestId,
                action_type: 'posting_added',
                message: `Job posted on ${formData.platform} for "${positionTitle}"`,
            }])

            onSuccess()
            onClose()
        } catch (error: any) {
            console.error('Error adding posting:', error)
            alert(error.message || 'Failed to add posting')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Transition appear show={true} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/25" />
                </TransitionChild>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                                <div className="flex items-center justify-between mb-5">
                                    <DialogTitle as="h3" className="text-lg font-medium leading-6 text-gray-900">
                                        Log New Posting
                                    </DialogTitle>
                                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
                                        <XMarkIcon className="h-5 w-5 text-gray-500" />
                                    </button>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    {/* Platform Selection */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Platform</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {platforms.map((p: PlatformOption) => (
                                                <button
                                                    key={p.value}
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, platform: p.value }))}
                                                    className={`
                                                        flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border
                                                        ${formData.platform === p.value
                                                            ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                                                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300'}
                                                    `}
                                                >
                                                    <span className="text-base">{p.icon}</span>
                                                    <span>{p.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Post URL */}
                                    <div>
                                        <label htmlFor="platform_url" className="block text-sm font-medium text-gray-700">
                                            Post URL <span className="text-gray-400 font-normal">(optional)</span>
                                        </label>
                                        <input
                                            type="url"
                                            name="platform_url"
                                            id="platform_url"
                                            placeholder="https://..."
                                            value={formData.platform_url}
                                            onChange={handleChange}
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2 text-gray-900"
                                        />
                                    </div>

                                    {/* Notes */}
                                    <div>
                                        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes</label>
                                        <textarea
                                            name="notes"
                                            id="notes"
                                            rows={2}
                                            placeholder="Any details about this posting..."
                                            value={formData.notes}
                                            onChange={handleChange}
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2 text-gray-900"
                                        />
                                    </div>

                                    {/* Actions */}
                                    <div className="mt-5 sm:mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                                        <button
                                            type="button"
                                            className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none sm:text-sm"
                                            onClick={onClose}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none sm:text-sm disabled:opacity-50"
                                        >
                                            {submitting ? 'Saving...' : 'Log Posting'}
                                        </button>
                                    </div>
                                </form>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    )
}
