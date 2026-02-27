'use client'

import { useState, Fragment } from 'react'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { XMarkIcon, PaperClipIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import { HiringRequest } from '@/types/human-resources'

interface AddCandidateModalProps {
    hiringRequest: HiringRequest
    onClose: () => void
    onSuccess: () => void
}

export function AddCandidateModal({ hiringRequest, onClose, onSuccess }: AddCandidateModalProps) {
    const [submitting, setSubmitting] = useState(false)
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        phone: '',
        source: 'Referral',
        notes: ''
    })
    const [file, setFile] = useState<File | null>(null)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)

        try {
            let cv_url = null

            if (file) {
                const fileExt = file.name.split('.').pop()
                const fileName = `${hiringRequest.id}/${Math.random().toString(36).substring(2)}.${fileExt}`
                const filePath = `${fileName}`

                const { error: uploadError } = await supabase.storage
                    .from('hr-documents')
                    .upload(filePath, file)

                if (uploadError) {
                    console.error('Upload Error:', uploadError)
                    throw new Error('Failed to upload CV: ' + uploadError.message)
                }

                // Get public URL (or signed URL depending on bucket privacy)
                // Assuming 'hr-documents' is public for this MVP or we use signed urls later.
                // For now, let's construct access URL.
                const { data: urlData } = supabase.storage
                    .from('hr-documents')
                    .getPublicUrl(filePath)

                cv_url = urlData.publicUrl
            }

            const { error } = await supabase
                .from('candidates')
                .insert([{
                    hiring_request_id: hiringRequest.id,
                    full_name: formData.full_name,
                    email: formData.email,
                    phone: formData.phone,
                    source: formData.source,
                    notes: formData.notes,
                    cv_url: cv_url,
                    stage: 'new'
                }])

            if (error) throw error

            // Log Activity
            await supabase.from('hr_activity_log').insert([{
                hiring_request_id: hiringRequest.id,
                action_type: 'candidate_added',
                message: `Added candidate ${formData.full_name} from ${formData.source}`
            }])

            onSuccess()
            onClose()
        } catch (error: any) {
            console.error('Error adding candidate:', error)
            alert(error.message || 'Failed to add candidate')
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
                                        Add Candidate
                                    </DialogTitle>
                                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
                                        <XMarkIcon className="h-5 w-5 text-gray-500" />
                                    </button>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">Full Name</label>
                                        <input
                                            type="text"
                                            name="full_name"
                                            id="full_name"
                                            required
                                            value={formData.full_name}
                                            onChange={handleChange}
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                                            <input
                                                type="email"
                                                name="email"
                                                id="email"
                                                value={formData.email}
                                                onChange={handleChange}
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone</label>
                                            <input
                                                type="text"
                                                name="phone"
                                                id="phone"
                                                value={formData.phone}
                                                onChange={handleChange}
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="source" className="block text-sm font-medium text-gray-700">Source</label>
                                        <select
                                            name="source"
                                            id="source"
                                            value={formData.source}
                                            onChange={handleChange}
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                                        >
                                            <option value="Referral">Referral</option>
                                            <option value="Facebook">Facebook</option>
                                            <option value="Zalo">Zalo</option>
                                            <option value="Walk-in">Walk-in</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label htmlFor="cv" className="block text-sm font-medium text-gray-700">CV (PDF/Image)</label>
                                        <div className="mt-1 flex justify-center rounded-md border-2 border-dashed border-gray-300 px-6 pt-5 pb-6">
                                            <div className="space-y-1 text-center">
                                                <PaperClipIcon className="mx-auto h-12 w-12 text-gray-400" />
                                                <div className="flex text-sm text-gray-600">
                                                    <label
                                                        htmlFor="file-upload"
                                                        className="relative cursor-pointer rounded-md bg-white font-medium text-blue-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 hover:text-blue-500"
                                                    >
                                                        <span>Upload a file</span>
                                                        <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />
                                                    </label>
                                                    <p className="pl-1">or drag and drop</p>
                                                </div>
                                                <p className="text-xs text-gray-500">PDF, DOC, PNG, JPG up to 10MB</p>
                                            </div>
                                        </div>
                                        {file && <p className="mt-2 text-sm text-green-600">Selected: {file.name}</p>}
                                    </div>

                                    <div>
                                        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes</label>
                                        <textarea
                                            name="notes"
                                            id="notes"
                                            rows={2}
                                            value={formData.notes}
                                            onChange={handleChange}
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                                        />
                                    </div>

                                    <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:flow-row-dense">
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="inline-flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none sm:col-start-2 sm:text-sm disabled:opacity-50"
                                        >
                                            {submitting ? 'Saving...' : 'Add Candidate'}
                                        </button>
                                        <button
                                            type="button"
                                            className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none sm:col-start-1 sm:mt-0 sm:text-sm"
                                            onClick={onClose}
                                        >
                                            Cancel
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
