'use client'


import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase_shim'
import { HiringRequestPriority } from '@/types/human-resources'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'

// Helper for currency formatting (1,000,000)
const formatCurrency = (value: string | number) => {
    if (!value) return ''
    // Remove non-digits
    const cleanValue = String(value).replace(/\D/g, '')
    // Add commas
    return cleanValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// Helper to parse currency back to number
const parseCurrency = (value: string) => {
    if (!value) return null
    return parseFloat(value.replace(/,/g, ''))
}

// ... imports
import { HiringRequest } from '@/types/human-resources'

interface HiringRequestFormProps {
    initialData?: HiringRequest
}

export function HiringRequestForm({ initialData }: HiringRequestFormProps) {
    const router = useRouter()
    const { language } = useSettings() // Using context for language if needed later
    const [submitting, setSubmitting] = useState(false)
    const [branches, setBranches] = useState<{ id: string, name: string }[]>([])
    const [loadingBranches, setLoadingBranches] = useState(true)
    const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false)

    const [formData, setFormData] = useState({
        position_title: initialData?.position_title || '',
        department: initialData?.department || '',
        branch_ids: initialData?.branch_ids || [],
        headcount: initialData?.headcount || 1,
        priority: (initialData?.priority || 'medium') as HiringRequestPriority,
        salary_min: formatCurrency(initialData?.salary_min || ''),
        salary_max: formatCurrency(initialData?.salary_max || ''),
        currency: initialData?.currency || 'VND',
        description: initialData?.description || '',
        requirements: initialData?.requirements || '',
        benefits: initialData?.benefits || '',
        notes: initialData?.notes || ''
    })

    useEffect(() => {
        const fetchBranches = async () => {
            try {
                const { data } = await supabase
                    .from('provider_branches')
                    .select('id, name')
                    .order('name')

                if (data) {
                    setBranches(data.map(b => ({ id: String(b.id), name: b.name })))
                }
            } catch (err) {
                console.error('Failed to load branches', err)
            } finally {
                setLoadingBranches(false)
            }
        }
        fetchBranches()
    }, [])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target

        if (name === 'salary_min' || name === 'salary_max') {
            // Handle currency formatting
            const formatted = formatCurrency(value)
            setFormData(prev => ({ ...prev, [name]: formatted }))
        } else {
            setFormData(prev => ({ ...prev, [name]: value }))
        }
    }

    const handleBranchToggle = (branchId: string) => {
        setFormData(prev => {
            const current = prev.branch_ids as string[]
            if (current.includes(branchId)) {
                return { ...prev, branch_ids: current.filter(id => id !== branchId) }
            } else {
                return { ...prev, branch_ids: [...current, branchId] }
            }
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)

        if ((formData.branch_ids as string[]).length === 0) {
            alert('Please select at least one branch')
            setSubmitting(false)
            return
        }

        try {
            const payload = {
                ...formData,
                salary_min: parseCurrency(formData.salary_min),
                salary_max: parseCurrency(formData.salary_max),
                headcount: Number(formData.headcount),
                status: initialData?.status || 'draft'
            }

            let result

            if (initialData) {
                // Update
                const { data, error } = await supabase
                    .from('hiring_requests')
                    .update(payload)
                    .eq('id', initialData.id)
                    .select()
                    .single()

                if (error) throw error
                result = data

                // Log activity
                await supabase.from('hr_activity_log').insert([{
                    hiring_request_id: result.id,
                    action_type: 'updated',
                    message: `Hiring request "${result.position_title}" was updated`,
                }])
            } else {
                // Create
                const { data, error } = await supabase
                    .from('hiring_requests')
                    .insert([payload])
                    .select()
                    .single()

                if (error) throw error
                result = data

                // Log activity
                await supabase.from('hr_activity_log').insert([{
                    hiring_request_id: result.id,
                    action_type: 'created',
                    message: `Hiring request "${result.position_title}" was created`,
                }])
            }

            router.push(`/human-resources/recruitment/${result.id}`)
            router.refresh()
        } catch (error) {
            console.error('Error saving request:', error)
            alert('Failed to save request. Please try again.')
        } finally {
            setSubmitting(false)
        }
    }
    // ...

    if (loadingBranches) return <CircularLoader />

    return (
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">

                {/* Position Title */}
                <div className="sm:col-span-3">
                    <label htmlFor="position_title" className="block text-sm font-medium text-gray-700">Position Title</label>
                    <div className="mt-1">
                        <input
                            type="text"
                            name="position_title"
                            id="position_title"
                            required
                            value={formData.position_title}
                            onChange={handleChange}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900"
                        />
                    </div>
                </div>

                {/* Department */}
                <div className="sm:col-span-3">
                    <label htmlFor="department" className="block text-sm font-medium text-gray-700">Department</label>
                    <div className="mt-1">
                        <select
                            id="department"
                            name="department"
                            required
                            value={formData.department}
                            onChange={handleChange}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900"
                        >
                            <option value="">Select Department</option>
                            <option value="Kitchen">Kitchen</option>
                            <option value="Service">Service</option>
                            <option value="Bar">Bar</option>
                            <option value="Management">Management</option>
                            <option value="Cleaning">Cleaning</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                </div>

                {/* Branch Multi-Select Dropdown */}
                <div className="sm:col-span-3 relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Branches</label>
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
                            className="relative w-full cursor-default rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                        >
                            <span className="block truncate text-gray-900">
                                {(formData.branch_ids as string[]).length > 0
                                    ? branches
                                        .filter(b => (formData.branch_ids as string[]).includes(b.id))
                                        .map(b => b.name)
                                        .join(', ')
                                    : <span className="text-gray-500">Select Branches</span>}
                            </span>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                    <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </span>
                        </button>

                        {isBranchDropdownOpen && (
                            <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                                {branches.map((b) => (
                                    <div
                                        key={b.id}
                                        className="relative flex cursor-pointer select-none items-center py-2 pl-3 pr-9 hover:bg-gray-100"
                                        onClick={() => handleBranchToggle(b.id)}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={(formData.branch_ids as string[]).includes(b.id)}
                                            readOnly
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="ml-3 block truncate font-normal text-gray-900">
                                            {b.name}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {(formData.branch_ids as string[]).length === 0 && (
                        <p className="mt-1 text-sm text-red-500">Please select at least one branch.</p>
                    )}
                </div>

                {/* Headcount */}
                <div className="sm:col-span-1">
                    <label htmlFor="headcount" className="block text-sm font-medium text-gray-700">Headcount</label>
                    <div className="mt-1">
                        <input
                            type="number"
                            name="headcount"
                            id="headcount"
                            min="1"
                            required
                            value={formData.headcount}
                            onChange={handleChange}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900"
                        />
                    </div>
                </div>

                {/* Priority */}
                <div className="sm:col-span-2">
                    <label htmlFor="priority" className="block text-sm font-medium text-gray-700">Priority</label>
                    <div className="mt-1">
                        <select
                            id="priority"
                            name="priority"
                            value={formData.priority}
                            onChange={handleChange}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900"
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                        </select>
                    </div>
                </div>

                {/* Salary Range */}
                <div className="sm:col-span-3">
                    <label htmlFor="salary_min" className="block text-sm font-medium text-gray-700">Min Salary</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                        <input
                            type="text"
                            name="salary_min"
                            id="salary_min"
                            placeholder="0"
                            value={formData.salary_min}
                            onChange={handleChange}
                            className="block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border pr-12 text-gray-900"
                        />
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                            <span className="text-gray-500 sm:text-sm">VND</span>
                        </div>
                    </div>
                </div>

                <div className="sm:col-span-3">
                    <label htmlFor="salary_max" className="block text-sm font-medium text-gray-700">Max Salary</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                        <input
                            type="text"
                            name="salary_max"
                            id="salary_max"
                            placeholder="0"
                            value={formData.salary_max}
                            onChange={handleChange}
                            className="block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border pr-12 text-gray-900"
                        />
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                            <span className="text-gray-500 sm:text-sm">VND</span>
                        </div>
                    </div>
                </div>

                {/* Description */}
                <div className="sm:col-span-6">
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700">Job Description</label>
                    <div className="mt-1">
                        <textarea
                            id="description"
                            name="description"
                            rows={3}
                            value={formData.description}
                            onChange={handleChange}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900"
                        />
                    </div>
                </div>

                {/* Requirements */}
                <div className="sm:col-span-6">
                    <label htmlFor="requirements" className="block text-sm font-medium text-gray-700">Requirements</label>
                    <div className="mt-1">
                        <textarea
                            id="requirements"
                            name="requirements"
                            rows={3}
                            value={formData.requirements}
                            onChange={handleChange}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900"
                        />
                    </div>
                </div>

                {/* Benefits */}
                <div className="sm:col-span-6">
                    <label htmlFor="benefits" className="block text-sm font-medium text-gray-700">Benefits</label>
                    <div className="mt-1">
                        <textarea
                            id="benefits"
                            name="benefits"
                            rows={3}
                            value={formData.benefits}
                            onChange={handleChange}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900"
                        />
                    </div>
                </div>

            </div>

            <div className="flex justify-end pt-5">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="rounded-lg border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={submitting}
                    className="ml-3 inline-flex justify-center rounded-lg border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none disabled:opacity-50"
                >
                    {submitting ? 'Saving...' : (initialData ? 'Update Request' : 'Create Draft')}
                </button>
            </div>
        </form>
    )
}
