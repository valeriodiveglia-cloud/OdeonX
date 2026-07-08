'use client'

import { useState, useEffect, Fragment } from 'react'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import { RecruitmentPlatformPackage, RecruitmentPosting } from '@/types/human-resources'
import { Package } from 'lucide-react'
import { PackageManagerModal } from './PackageManagerModal'

interface PlatformOption {
    value: string
    label: string
    icon: string
    has_packages: boolean
}

interface AddPostingModalProps {
    hiringRequestId: string
    positionTitle: string
    postingToEdit?: RecruitmentPosting | null
    onClose: () => void
    onSuccess: () => void
}

export function AddPostingModal({ hiringRequestId, positionTitle, postingToEdit = null, onClose, onSuccess }: AddPostingModalProps) {
    const { language } = useSettings()
    const isVI = language === 'vi'

    const [submitting, setSubmitting] = useState(false)
    const [platforms, setPlatforms] = useState<PlatformOption[]>([])
    const [selectedPkg, setSelectedPkg] = useState<RecruitmentPlatformPackage | null>(null)
    const [showSelectPackageModal, setShowSelectPackageModal] = useState(false)
    const [showDirectCostInput, setShowDirectCostInput] = useState(false)

    const [formData, setFormData] = useState({
        platform: '',
        platform_url: '',
        notes: '',
        posted_at: new Date().toISOString().substring(0, 10),
        expires_at: '',
        package_id: '',
        direct_cost: '0'
    })

    const [prevPlatform, setPrevPlatform] = useState<string>('')
    const [userRole, setUserRole] = useState<string | null>(null)

    useEffect(() => {
        const fetchUserRole = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const { data } = await supabase
                        .from('app_accounts')
                        .select('role')
                        .eq('user_id', user.id)
                        .single()
                    if (data) {
                        setUserRole(data.role)
                    }
                }
            } catch (err) {
                console.error('Error fetching role in AddPostingModal:', err)
            }
        }
        fetchUserRole()
    }, [])

    useEffect(() => {
        const fetchPlatforms = async () => {
            try {
                const { data, error } = await supabase
                    .from('recruitment_platforms')
                    .select('value, label, icon, has_packages')
                    .order('sort_order', { ascending: true })

                if (error) throw error
                const items = (data || []) as PlatformOption[]
                setPlatforms(items)
                if (items.length > 0 && !postingToEdit) {
                    const firstPlatform = items[0]
                    setFormData(prev => ({ 
                        ...prev, 
                        platform: firstPlatform.value
                    }))
                }
            } catch (error) {
                console.error('Error fetching platforms:', error)
            }
        }
        fetchPlatforms()
    }, [postingToEdit])

    // Load postingToEdit if provided
    useEffect(() => {
        if (postingToEdit) {
            setFormData({
                platform: postingToEdit.platform,
                platform_url: postingToEdit.platform_url || '',
                notes: postingToEdit.notes || '',
                posted_at: new Date(postingToEdit.posted_at).toISOString().substring(0, 10),
                expires_at: postingToEdit.expires_at ? new Date(postingToEdit.expires_at).toISOString().substring(0, 10) : '',
                package_id: postingToEdit.package_id || '',
                direct_cost: postingToEdit.direct_cost ? postingToEdit.direct_cost.toString() : '0'
            })
            if (postingToEdit.direct_cost && postingToEdit.direct_cost > 0) {
                setShowDirectCostInput(true)
            }
            setPrevPlatform(postingToEdit.platform)
            if (postingToEdit.package_id) {
                setSelectedPkg({
                    id: postingToEdit.package_id,
                    platform: postingToEdit.platform,
                    name: postingToEdit.package_name || 'Package',
                    total_cost: 0,
                    currency: postingToEdit.currency || 'VND',
                    start_date: '',
                    end_date: null,
                    max_posts: null,
                    notes: '',
                    created_at: new Date().toISOString()
                })
            }
        }
    }, [postingToEdit])

    const selectedPlatform = platforms.find(p => p.value === formData.platform)

    // Clear selected package when platform changes
    useEffect(() => {
        if (prevPlatform && formData.platform !== prevPlatform) {
            setSelectedPkg(null)
            setFormData(prev => ({ ...prev, package_id: '' }))
        }
        setPrevPlatform(formData.platform)
    }, [formData.platform])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (selectedPlatform?.has_packages && !formData.package_id) {
            alert(isVI ? 'Vui lòng chọn một gói dịch vụ.' : 'Please select a package.')
            return
        }

        setSubmitting(true)

        const isPackage = selectedPlatform?.has_packages
        const pkgId = isPackage ? formData.package_id : null
        const directCostVal = isPackage ? 0 : parseFloat(formData.direct_cost || '0') || 0
        
        const payload: any = {
            platform: formData.platform,
            platform_url: formData.platform_url || null,
            notes: formData.notes || null,
            posted_at: new Date(formData.posted_at).toISOString(),
            expires_at: formData.expires_at ? new Date(formData.expires_at).toISOString() : null,
            package_id: pkgId,
            package_name: isPackage ? (selectedPkg?.name || null) : null,
            direct_cost: directCostVal
        }

        try {
            if (postingToEdit) {
                const { error } = await supabase
                    .from('recruitment_postings')
                    .update(payload)
                    .eq('id', postingToEdit.id)

                if (error) throw error
            } else {
                payload.hiring_request_id = hiringRequestId
                payload.status = 'active'
                payload.responses_count = 0
                payload.hired_count = 0
                payload.direct_cost = 0
                payload.currency = 'VND'

                const { error } = await supabase
                    .from('recruitment_postings')
                    .insert([payload])

                if (error) throw error
            }

            onSuccess()
            onClose()
        } catch (error: any) {
            console.error('Error adding posting:', error)
            alert(error.message || (isVI ? 'Lỗi ghi nhận bài đăng' : 'Failed to add posting'))
        } finally {
            setSubmitting(false)
        }
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat(isVI ? 'vi-VN' : 'en-US', {
            style: 'currency',
            currency: 'VND',
            maximumFractionDigits: 0
        }).format(amount)
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
                    <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" />
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
                            <DialogPanel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl border border-gray-100 transition-all text-gray-900">
                                <div className="flex items-center justify-between mb-5 pb-3 border-b border-gray-100">
                                    <DialogTitle as="h3" className="text-lg font-bold text-slate-800">
                                        {postingToEdit 
                                            ? (isVI ? 'Sửa bài đăng tuyển' : 'Edit Posting Log') 
                                            : (isVI ? 'Ghi nhận đăng tuyển mới' : 'Log New Posting')}
                                    </DialogTitle>
                                    <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 cursor-pointer">
                                        <XMarkIcon className="h-5 w-5 text-slate-400" />
                                    </button>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    {/* Platform Selection Dropdown */}
                                    <div>
                                        <label htmlFor="platform" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                            {isVI ? 'Kênh tuyển dụng' : 'Recruitment Platform'}
                                        </label>
                                        <select
                                            name="platform"
                                            id="platform"
                                            value={formData.platform}
                                            onChange={handleChange}
                                            className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-semibold cursor-pointer"
                                        >
                                            {platforms.map((p: PlatformOption) => (
                                                <option key={p.value} value={p.value}>
                                                    {p.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Selected Package Card Field */}
                                    {selectedPlatform?.has_packages && (
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                                                {isVI ? 'Gói dịch vụ tuyển dụng' : 'Recruitment Package'} <span className="text-red-500">*</span>
                                            </label>
                                            
                                            {selectedPkg ? (
                                                /* Package Selected Display */
                                                <div className="flex items-center justify-between p-3.5 bg-blue-50/40 border border-blue-200 rounded-xl">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 rounded-xl bg-blue-100 text-blue-750">
                                                            <Package className="w-4 h-4" />
                                                        </div>
                                                        <div>
                                                            <span className="block text-xs font-bold text-slate-800">{selectedPkg.name}</span>
                                                             {userRole !== 'manager' && (
                                                                 <span className="block text-[10px] text-slate-500 font-bold mt-0.5">
                                                                     {isVI ? 'Chi phí: ' : 'Cost: '} {formatCurrency(selectedPkg.total_cost)}
                                                                 </span>
                                                             )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowSelectPackageModal(true)}
                                                        className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-655 transition cursor-pointer"
                                                    >
                                                        {isVI ? 'Thay đổi' : 'Change'}
                                                    </button>
                                                </div>
                                            ) : (
                                                /* Dashed Empty Area Selector */
                                                <div 
                                                    onClick={() => setShowSelectPackageModal(true)}
                                                    className="w-full bg-white border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:bg-slate-50 hover:border-gray-400 transition"
                                                >
                                                    <Package className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
                                                    <span className="text-xs font-bold text-slate-655 block">
                                                        {isVI ? 'Chọn gói dịch vụ hoạt động...' : 'Select an active package...'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {!selectedPlatform?.has_packages && userRole !== 'manager' && (
                                        <div>
                                            {showDirectCostInput ? (
                                                <div>
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <label htmlFor="direct_cost" className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                            {isVI ? 'Chi phí trực tiếp (VND)' : 'Direct Cost (VND)'}
                                                        </label>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setShowDirectCostInput(false)
                                                                setFormData(prev => ({ ...prev, direct_cost: '0' }))
                                                            }}
                                                            className="text-[10px] font-bold text-red-500 hover:text-red-700 transition cursor-pointer"
                                                        >
                                                            {isVI ? 'Gỡ bỏ' : 'Remove'}
                                                        </button>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        name="direct_cost"
                                                        id="direct_cost"
                                                        min="0"
                                                        value={formData.direct_cost}
                                                        onChange={handleChange}
                                                        className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-gray-900 font-semibold h-10"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowDirectCostInput(true)}
                                                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition cursor-pointer"
                                                    >
                                                        + {isVI ? 'Thêm chi phí trực tiếp' : 'Add Direct Cost'}
                                                    </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Post URL */}
                                    <div>
                                        <label htmlFor="platform_url" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                            {isVI ? 'Đường dẫn bài viết (URL)' : 'Post URL'}{' '}
                                            <span className="text-slate-400 font-normal lowercase">({isVI ? 'tùy chọn' : 'optional'})</span>
                                        </label>
                                        <input
                                            type="url"
                                            name="platform_url"
                                            id="platform_url"
                                            placeholder="https://..."
                                            value={formData.platform_url}
                                            onChange={handleChange}
                                            className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-medium placeholder:text-slate-400"
                                        />
                                    </div>

                                    {/* Dates row */}
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Posted Date */}
                                        <div>
                                            <label htmlFor="posted_at" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {isVI ? 'Ngày đăng' : 'Posted Date'}
                                            </label>
                                            <input
                                                type="date"
                                                name="posted_at"
                                                id="posted_at"
                                                required
                                                value={formData.posted_at}
                                                onChange={handleChange}
                                                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-medium"
                                            />
                                        </div>

                                        {/* Expires At */}
                                        <div>
                                            <label htmlFor="expires_at" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {isVI ? 'Hạn đăng tin' : 'Expiration Date'}{' '}
                                                <span className="text-slate-400 font-normal lowercase">({isVI ? 'tùy chọn' : 'optional'})</span>
                                            </label>
                                            <input
                                                type="date"
                                                name="expires_at"
                                                id="expires_at"
                                                value={formData.expires_at}
                                                onChange={handleChange}
                                                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-medium"
                                            />
                                        </div>
                                    </div>

                                    {/* Notes */}
                                    <div>
                                        <label htmlFor="notes" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                            {isVI ? 'Ghi chú' : 'Notes'}
                                        </label>
                                        <textarea
                                            name="notes"
                                            id="notes"
                                            rows={2}
                                            placeholder={isVI ? 'Nhập ghi chú hoặc mô tả ngắn cho bài đăng...' : 'Any details about this posting...'}
                                            value={formData.notes}
                                            onChange={handleChange}
                                            className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-gray-900 font-medium placeholder:text-slate-400"
                                        />
                                    </div>

                                    {/* Actions */}
                                    <div className="mt-5 pt-3 border-t border-gray-150 flex justify-end gap-3">
                                        <button
                                            type="button"
                                            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-655 hover:bg-slate-105 hover:text-slate-900 transition cursor-pointer"
                                            onClick={onClose}
                                        >
                                            {isVI ? 'Hủy' : 'Cancel'}
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submitting || (selectedPlatform?.has_packages && !formData.package_id)}
                                            className="inline-flex justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                        >
                                            {submitting ? (isVI ? 'Đang lưu...' : 'Saving...') : (postingToEdit ? (isVI ? 'Lưu' : 'Save') : (isVI ? 'Ghi nhận' : 'Log Posting'))}
                                        </button>
                                    </div>
                                </form>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>

            {/* Select Package Modal Stacked on Top (z-60) */}
            {showSelectPackageModal && formData.platform && (
                <PackageManagerModal
                    platformValue={formData.platform}
                    platformLabel={selectedPlatform?.label || ''}
                    onClose={() => setShowSelectPackageModal(false)}
                    onSelect={(pkg) => {
                        setSelectedPkg(pkg)
                        setFormData(prev => ({ ...prev, package_id: pkg.id }))
                    }}
                />
            )}
        </Transition>
    )
}
