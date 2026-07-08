'use client'

import { useState, useEffect, Fragment } from 'react'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import { RecruitmentPlatformPackage } from '@/types/human-resources'
import { Plus, Pencil, Trash2, Calendar, Check, X, RefreshCw } from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'

const formatDate = (dateString?: string | null) => {
    if (!dateString) return '—'
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return '—'
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
}

function moneyToNumber(raw: string | number | null | undefined): number {
    if (raw == null || raw === '') return 0
    return Number(String(raw).replace(/\s+/g, '').replace(/,/g, ''))
}

interface PackageManagerModalProps {
    platformValue: string
    platformLabel: string
    onClose: () => void
    onSuccess?: () => void
    onSelect?: (pkg: RecruitmentPlatformPackage) => void // If provided, enables selection mode
}

export function PackageManagerModal({ platformValue, platformLabel, onClose, onSuccess, onSelect }: PackageManagerModalProps) {
    const { language } = useSettings()
    const isVI = language === 'vi'

    const [packages, setPackages] = useState<RecruitmentPlatformPackage[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [editingPackage, setEditingPackage] = useState<Partial<RecruitmentPlatformPackage> | null>(null)
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const [extendingPackage, setExtendingPackage] = useState<RecruitmentPlatformPackage | null>(null)
    const [extensionData, setExtensionData] = useState({
        additional_cost: '',
        additional_posts: '',
        new_end_date: ''
    })

    // Form inputs state
    const [formData, setFormData] = useState({
        name: '',
        total_cost: '',
        currency: 'VND',
        start_date: new Date().toISOString().substring(0, 10),
        end_date: '',
        max_posts: '',
        notes: ''
    })

    useEffect(() => {
        fetchPackages()
    }, [platformValue])

    const fetchPackages = async () => {
        setLoading(true)
        try {
            // Fetch packages
            const { data: pkgData, error: pkgError } = await supabase
                .from('recruitment_platform_packages')
                .select('*')
                .eq('platform', platformValue)
                .order('start_date', { ascending: false })

            if (pkgError) throw pkgError

            // Fetch posting counts for these packages to show usage
            const { data: postData, error: postError } = await supabase
                .from('recruitment_postings')
                .select('package_id')
                .eq('platform', platformValue)
                .not('package_id', 'is', null)

            if (postError) throw postError

            const counts: Record<string, number> = {}
            if (postData) {
                postData.forEach((p: any) => {
                    counts[p.package_id] = (counts[p.package_id] || 0) + 1
                })
            }

            const merged = (pkgData || []).map((pkg: any) => ({
                ...pkg,
                postings_count: counts[pkg.id] || 0
            })) as RecruitmentPlatformPackage[]

            setPackages(merged)
        } catch (error) {
            console.error('Error fetching packages:', error)
        } finally {
            setLoading(false)
        }
    }

    const startNewForm = () => {
        setFormData({
            name: '',
            total_cost: '',
            currency: 'VND',
            start_date: new Date().toISOString().substring(0, 10),
            end_date: '',
            max_posts: '',
            notes: ''
        })
        setEditingPackage({ id: undefined })
        setShowForm(true)
    }

    const startEdit = (pkg: RecruitmentPlatformPackage) => {
        setFormData({
            name: pkg.name,
            total_cost: pkg.total_cost.toLocaleString('en-US'),
            currency: pkg.currency || 'VND',
            start_date: pkg.start_date,
            end_date: pkg.end_date || '',
            max_posts: pkg.max_posts ? pkg.max_posts.toString() : '',
            notes: pkg.notes || ''
        })
        setEditingPackage(pkg)
        setShowForm(true)
    }

    const cancelForm = () => {
        setShowForm(false)
        setEditingPackage(null)
    }

    const startExtension = (pkg: RecruitmentPlatformPackage) => {
        let defaultNewEndDate = ''
        if (pkg.end_date && pkg.start_date) {
            const start = new Date(pkg.start_date)
            const end = new Date(pkg.end_date)
            const durationMs = end.getTime() - start.getTime()
            if (durationMs > 0) {
                const currentEnd = new Date(pkg.end_date)
                const newEnd = new Date(currentEnd.getTime() + durationMs)
                defaultNewEndDate = newEnd.toISOString().substring(0, 10)
            }
        }
        setExtensionData({
            additional_cost: pkg.total_cost.toLocaleString('en-US'),
            additional_posts: pkg.max_posts ? pkg.max_posts.toString() : '',
            new_end_date: defaultNewEndDate || (pkg.end_date || '')
        })
        setExtendingPackage(pkg)
    }

    const handleExtensionSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!extendingPackage) return

        setSaving(true)
        const addCost = moneyToNumber(extensionData.additional_cost)
        const addPosts = extensionData.additional_posts.trim() ? parseInt(extensionData.additional_posts) : 0

        const newTotalCost = extendingPackage.total_cost + addCost
        const newMaxPosts = extendingPackage.max_posts !== null 
            ? (extendingPackage.max_posts + addPosts) 
            : (addPosts > 0 ? addPosts : null)
        const newEndDate = extensionData.new_end_date || extendingPackage.end_date

        const todayStr = new Date().toLocaleDateString(isVI ? 'vi-VN' : 'en-US')
        const costStr = formatCurrency(addCost)
        const postsStr = addPosts > 0 ? `+${addPosts} posts` : 'unlimited posts'
        const extLog = `\n[Extension ${todayStr}: ${costStr}, ${postsStr}, new expiry: ${formatDate(newEndDate)}]`
        const newNotes = `${extendingPackage.notes || ''}${extLog}`.trim()

        try {
            const { error } = await supabase
                .from('recruitment_platform_packages')
                .update({
                    total_cost: newTotalCost,
                    max_posts: newMaxPosts,
                    end_date: newEndDate || null,
                    notes: newNotes
                })
                .eq('id', extendingPackage.id)

            if (error) throw error

            if (onSuccess) onSuccess()
            setExtendingPackage(null)
            fetchPackages()
        } catch (error: any) {
            console.error('Error extending package:', error)
            alert(error.message || (isVI ? 'Lỗi gia hạn gói dịch vụ' : 'Failed to extend package'))
        } finally {
            setSaving(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.name.trim() || !formData.total_cost.trim()) return

        setSaving(true)
        const costVal = moneyToNumber(formData.total_cost)
        const maxPostsVal = formData.max_posts.trim() ? parseInt(formData.max_posts) : null

        const payload = {
            platform: platformValue,
            name: formData.name.trim(),
            total_cost: costVal,
            currency: formData.currency,
            start_date: formData.start_date,
            end_date: formData.end_date || null,
            max_posts: maxPostsVal,
            notes: formData.notes.trim() || null
        }

        try {
            if (editingPackage?.id) {
                const { error } = await supabase
                    .from('recruitment_platform_packages')
                    .update(payload)
                    .eq('id', editingPackage.id)
                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('recruitment_platform_packages')
                    .insert([payload])
                if (error) throw error
            }

            if (onSuccess) onSuccess()
            setShowForm(false)
            setEditingPackage(null)
            fetchPackages()
        } catch (error: any) {
            console.error('Error saving package:', error)
            alert(error.message || (isVI ? 'Lỗi lưu gói dịch vụ' : 'Failed to save package'))
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase
                .from('recruitment_platform_packages')
                .delete()
                .eq('id', id)

            if (error) throw error
            setDeleteConfirmId(null)
            fetchPackages()
            if (onSuccess) onSuccess()
        } catch (error: any) {
            console.error('Error deleting package:', error)
            alert(error.message || (isVI ? 'Lỗi xóa gói dịch vụ' : 'Failed to delete package'))
        }
    }

    const isPackageActive = (pkg: RecruitmentPlatformPackage) => {
        const todayStr = new Date().toISOString().substring(0, 10)
        const isStarted = pkg.start_date <= todayStr
        const isNotExpired = !pkg.end_date || pkg.end_date >= todayStr
        const isNotFull = !pkg.max_posts || (pkg.postings_count || 0) < pkg.max_posts
        return isStarted && isNotExpired && isNotFull
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat(isVI ? 'vi-VN' : 'en-US', {
            style: 'currency',
            currency: 'VND',
            maximumFractionDigits: 0
        }).format(amount)
    }

    const textDict = {
        title: onSelect 
            ? (isVI ? `Chọn Gói dịch vụ: ${platformLabel}` : `Select Package: ${platformLabel}`)
            : (isVI ? `Quản lý gói dịch vụ: ${platformLabel}` : `Manage Packages: ${platformLabel}`),
        newTitle: isVI ? `Thêm gói dịch vụ mới: ${platformLabel}` : `Add New Package: ${platformLabel}`,
        editTitle: isVI ? 'Sửa gói dịch vụ' : 'Edit Package',
        empty: isVI ? 'Chưa cấu hình gói dịch vụ nào cho nền tảng này.' : 'No packages configured for this platform.',
        addBtn: isVI ? 'Thêm gói dịch vụ' : 'Add Package',
        active: isVI ? 'Đang hoạt động' : 'Active',
        expired: isVI ? 'Hết hạn/Hết lượt' : 'Expired/Full',
        nameLabel: isVI ? 'Tên gói / Package Name' : 'Package Name',
        costLabel: isVI ? 'Tổng chi phí / Total Cost' : 'Total Cost',
        startDate: isVI ? 'Ngày bắt đầu' : 'Start Date',
        endDate: isVI ? 'Ngày hết hạn' : 'Expiration Date',
        maxPosts: isVI ? 'Số lượng tin tối đa' : 'Max Job Posts',
        notes: isVI ? 'Ghi chú' : 'Notes',
        cancel: isVI ? 'Hủy' : 'Cancel',
        save: isVI ? 'Lưu' : 'Save',
        saving: isVI ? 'Đang lưu...' : 'Saving...',
        optional: isVI ? 'tùy chọn' : 'optional',
        deleteAsk: isVI ? 'Xóa?' : 'Delete?',
        selectBtn: isVI ? 'Chọn' : 'Select'
    }

    return (
        <Transition appear show={true} as={Fragment}>
            <Dialog as="div" className="relative z-[60]" onClose={onClose}>
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/25 backdrop-blur-xs" />
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
                            <DialogPanel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl border border-gray-100 transition-all text-gray-900">
                                {/* Header */}
                                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                                    <DialogTitle as="h3" className="text-lg font-bold text-slate-800">
                                        {extendingPackage 
                                            ? (isVI ? `Gia hạn gói dịch vụ: ${extendingPackage.name}` : `Extend Package: ${extendingPackage.name}`)
                                            : showForm 
                                                ? (editingPackage?.id ? textDict.editTitle : textDict.newTitle)
                                                : textDict.title
                                        }
                                    </DialogTitle>
                                    <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-105 text-slate-400 transition-colors cursor-pointer">
                                        <XMarkIcon className="h-5 w-5" />
                                    </button>
                                </div>

                                {loading ? (
                                    <div className="py-12 text-center text-slate-500 text-sm font-semibold">
                                        {isVI ? 'Đang tải gói dịch vụ...' : 'Loading packages...'}
                                    </div>
                                ) : extendingPackage ? (
                                    /* Extension Form */
                                    <form onSubmit={handleExtensionSubmit} className="space-y-4">
                                        <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 text-left">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{isVI ? 'Thông tin gói hiện tại' : 'Current Package Status'}</div>
                                            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-semibold text-slate-700">
                                                <div>{isVI ? 'Tên gói:' : 'Name:'} <span className="text-slate-900 font-bold">{extendingPackage.name}</span></div>
                                                <div>{isVI ? 'Tổng chi phí:' : 'Current Cost:'} <span className="text-slate-900 font-bold">{formatCurrency(extendingPackage.total_cost)}</span></div>
                                                <div>{isVI ? 'Số tin tuyển dụng:' : 'Job Posts:'} <span className="text-slate-900 font-bold">{extendingPackage.postings_count} / {extendingPackage.max_posts || (isVI ? 'Không giới hạn' : 'Unlimited')}</span></div>
                                                <div>{isVI ? 'Ngày hết hạn:' : 'Expiry Date:'} <span className="text-slate-900 font-bold">{formatDate(extendingPackage.end_date)}</span></div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 text-left">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{isVI ? 'Chi phí gia hạn thêm' : 'Additional Cost'} <span className="text-red-500">*</span></label>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        required
                                                        value={extensionData.additional_cost}
                                                        onChange={e => {
                                                            const clean = e.target.value.replace(/[^0-9]/g, '')
                                                            const num = parseInt(clean, 10)
                                                            setExtensionData({ 
                                                                ...extensionData, 
                                                                additional_cost: isNaN(num) ? '' : num.toLocaleString('en-US') 
                                                            })
                                                        }}
                                                        placeholder="0"
                                                        className="w-full bg-white border border-slate-300 placeholder:text-slate-400 rounded-lg pl-3 pr-12 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all h-10 font-semibold"
                                                    />
                                                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                                        <span className="text-slate-400 text-xs font-bold">VND</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{isVI ? 'Số tin cộng thêm' : 'Additional Posts Limit'}</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={extensionData.additional_posts}
                                                    onChange={e => setExtensionData({ ...extensionData, additional_posts: e.target.value })}
                                                    placeholder="0"
                                                    className="w-full bg-white border border-slate-300 placeholder:text-slate-400 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all h-10 font-semibold"
                                                />
                                            </div>
                                        </div>

                                        <div className="text-left">
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{isVI ? 'Ngày hết hạn mới' : 'New Expiration Date'} <span className="text-slate-400 font-normal lowercase">({isVI ? 'để trống để giữ nguyên' : 'leave empty to keep current'})</span></label>
                                            <input
                                                type="date"
                                                value={extensionData.new_end_date}
                                                onChange={e => setExtensionData({ ...extensionData, new_end_date: e.target.value })}
                                                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all h-10 font-semibold"
                                            />
                                        </div>

                                        <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                                            <button
                                                type="button"
                                                onClick={() => setExtendingPackage(null)}
                                                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-655 hover:bg-slate-100 transition cursor-pointer"
                                            >
                                                {isVI ? 'Hủy' : 'Cancel'}
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={saving}
                                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition shadow disabled:opacity-40 cursor-pointer"
                                            >
                                                {saving ? (isVI ? 'Đang lưu...' : 'Saving...') : (isVI ? 'Xác nhận gia hạn' : 'Confirm Extension')}
                                            </button>
                                        </div>
                                    </form>
                                ) : showForm ? (
                                    /* Creation / Edit Form */
                                    <form onSubmit={handleSubmit} className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{textDict.nameLabel} <span className="text-red-500">*</span></label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={formData.name}
                                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                    placeholder={isVI ? "Ví dụ: VIP Hoteljob 6 tháng" : "e.g. Hoteljob VIP 6 Months"}
                                                    className="w-full bg-white border border-slate-300 placeholder:text-slate-400 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all h-10 font-semibold"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{textDict.costLabel} <span className="text-red-500">*</span></label>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        required
                                                        value={formData.total_cost}
                                                        onChange={e => {
                                                            const clean = e.target.value.replace(/[^0-9]/g, '')
                                                            const num = parseInt(clean, 10)
                                                            setFormData({ 
                                                                ...formData, 
                                                                total_cost: isNaN(num) ? '' : num.toLocaleString('en-US') 
                                                            })
                                                        }}
                                                        placeholder="0"
                                                        className="w-full bg-white border border-slate-300 placeholder:text-slate-400 rounded-lg pl-3 pr-12 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all h-10 font-semibold"
                                                    />
                                                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                                        <span className="text-slate-400 text-xs font-bold">VND</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{textDict.startDate} <span className="text-red-500">*</span></label>
                                                <input
                                                    type="date"
                                                    required
                                                    value={formData.start_date}
                                                    onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                                                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all h-10 font-semibold"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{textDict.endDate} <span className="text-slate-400 font-normal lowercase">({textDict.optional})</span></label>
                                                <input
                                                    type="date"
                                                    value={formData.end_date}
                                                    onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                                                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all h-10 font-semibold"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{textDict.maxPosts} <span className="text-slate-400 font-normal lowercase">({textDict.optional})</span></label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={formData.max_posts}
                                                    onChange={e => setFormData({ ...formData, max_posts: e.target.value })}
                                                    placeholder={isVI ? "Không giới hạn" : "Unlimited"}
                                                    className="w-full bg-white border border-slate-300 placeholder:text-slate-400 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all h-10 font-semibold"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{textDict.notes} <span className="text-slate-400 font-normal lowercase">({textDict.optional})</span></label>
                                            <textarea
                                                value={formData.notes}
                                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                                rows={2}
                                                className="w-full bg-white border border-slate-300 placeholder:text-slate-400 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-semibold"
                                            />
                                        </div>

                                        <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                                            <button
                                                type="button"
                                                onClick={cancelForm}
                                                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-655 hover:bg-slate-100 transition cursor-pointer"
                                            >
                                                {textDict.cancel}
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={saving}
                                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition shadow disabled:opacity-40 cursor-pointer"
                                            >
                                                {saving ? textDict.saving : textDict.save}
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    /* Packages List */
                                    <div className="space-y-4">
                                        <div className="flex justify-end">
                                            <button
                                                onClick={startNewForm}
                                                className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition shadow cursor-pointer"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                {textDict.addBtn}
                                            </button>
                                        </div>

                                        {packages.length === 0 ? (
                                            <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl bg-slate-50/30">
                                                <Calendar className="mx-auto h-8 w-8 text-gray-300" />
                                                <p className="mt-2 text-sm text-slate-500 font-semibold">
                                                    {textDict.empty}
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="max-h-[350px] overflow-y-auto space-y-3 pr-1">
                                                {packages.map((pkg) => {
                                                    const active = isPackageActive(pkg)
                                                    const unitCost = pkg.postings_count && pkg.postings_count > 0 
                                                        ? pkg.total_cost / pkg.postings_count 
                                                        : pkg.total_cost

                                                    return (
                                                        <div 
                                                            key={pkg.id} 
                                                            className={`
                                                                border rounded-xl p-4 transition relative flex flex-col sm:flex-row sm:items-center justify-between gap-4
                                                                ${active ? 'border-gray-200 bg-white hover:shadow-sm' : 'border-gray-150 bg-gray-50/50 opacity-70'}
                                                            `}
                                                        >
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-2">
                                                                    <h4 className="font-bold text-slate-800 text-sm">{pkg.name}</h4>
                                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                                        active 
                                                                            ? 'bg-green-50 text-green-700 border-green-200' 
                                                                            : 'bg-slate-100 text-slate-500 border-slate-200'
                                                                    }`}>
                                                                        {active ? textDict.active : textDict.expired}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs font-semibold text-slate-700">
                                                                    {formatCurrency(pkg.total_cost)}
                                                                    {pkg.max_posts && ` · ${pkg.postings_count}/${pkg.max_posts} posts`}
                                                                    {!pkg.max_posts && ` · ${pkg.postings_count} posts`}
                                                                </p>
                                                                <p className="text-[11px] text-slate-400 font-semibold">
                                                                    {formatDate(pkg.start_date)} 
                                                                    {pkg.end_date ? ` → ${formatDate(pkg.end_date)}` : ` (${isVI ? 'Vô thời hạn' : 'No expiry'})`}
                                                                </p>
                                                                {pkg.notes && <p className="text-[11px] text-slate-500 italic max-w-md truncate">{pkg.notes}</p>}
                                                            </div>

                                                            <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-100">
                                                                {/* Unit Cost Info */}
                                                                {pkg.postings_count !== undefined && pkg.postings_count > 0 && (
                                                                    <div className="text-right">
                                                                        <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Unit Cost</span>
                                                                        <span className="text-xs font-semibold text-slate-800">{formatCurrency(unitCost)}</span>
                                                                    </div>
                                                                )}

                                                                {/* Actions */}
                                                                <div className="flex items-center gap-1.5">
                                                                    {/* Select button in selection mode */}
                                                                    {onSelect && active && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                onSelect(pkg)
                                                                                onClose()
                                                                            }}
                                                                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-750 text-white text-xs font-semibold transition shadow cursor-pointer shrink-0"
                                                                        >
                                                                            {textDict.selectBtn}
                                                                        </button>
                                                                    )}

                                                                <button 
                                                                         type="button"
                                                                         onClick={() => startExtension(pkg)}
                                                                         className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-xs cursor-pointer shrink-0"
                                                                     >
                                                                         <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                                                                         {isVI ? 'Gia hạn' : 'Extend'}
                                                                     </button>
                                                                       <button 
                                                                        type="button"
                                                                        onClick={() => startEdit(pkg)}
                                                                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-450 hover:text-blue-600 transition cursor-pointer"
                                                                    >
                                                                        <Pencil className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    
                                                                    {deleteConfirmId === pkg.id ? (
                                                                        <div className="flex items-center gap-1 bg-red-50 rounded-lg p-1 border border-red-150">
                                                                            <span className="text-[10px] text-red-650 font-bold px-1">{textDict.deleteAsk}</span>
                                                                            <button 
                                                                                type="button"
                                                                                onClick={() => handleDelete(pkg.id)}
                                                                                className="p-1 rounded bg-red-600 text-white hover:bg-red-700 transition cursor-pointer"
                                                                            >
                                                                                <Check className="w-3 h-3" />
                                                                            </button>
                                                                            <button 
                                                                                type="button"
                                                                                onClick={() => setDeleteConfirmId(null)}
                                                                                className="p-1 rounded bg-slate-205 text-slate-655 hover:bg-slate-350 transition cursor-pointer"
                                                                            >
                                                                                <X className="w-3 h-3" />
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <button 
                                                                            type="button"
                                                                            onClick={() => setDeleteConfirmId(pkg.id)}
                                                                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-450 hover:text-red-600 transition cursor-pointer"
                                                                        >
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    )
}
