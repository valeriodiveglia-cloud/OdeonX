'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Star, X, TrendingUp, TrendingDown, Plus, Trash2, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffPerformance, HRStaffMember, HRRatingCategory } from '@/types/human-resources'

// Helper to make a stable key from a label
const labelToKey = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')

/* ─── Helpers ─── */
export const OVERALL_LABELS: Record<number, { label: string; color: string; bg: string }> = {
    1: { label: 'Poor',          color: 'text-red-700',     bg: 'bg-red-50' },
    2: { label: 'Below Average', color: 'text-orange-700',  bg: 'bg-orange-50' },
    3: { label: 'Average',       color: 'text-amber-700',   bg: 'bg-amber-50' },
    4: { label: 'Good',          color: 'text-blue-700',    bg: 'bg-blue-50' },
    5: { label: 'Excellent',     color: 'text-emerald-700', bg: 'bg-emerald-50' },
}

function computeAverage(ratings: Record<string, number>): number {
    const vals = Object.values(ratings).filter(v => v > 0)
    if (vals.length === 0) return 0
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

/* Helper: fetch current user name from Supabase */
async function fetchCurrentUserNameFromDB(): Promise<string> {
    try {
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user || null
        if (!user) return ''
        const userId = String(user.id)
        const email = String(user.email || '')
        const { data, error } = await supabase
            .from('app_accounts')
            .select('name,email')
            .eq('user_id', userId)
            .limit(1)
            .single()
        if (error) return user.user_metadata?.full_name || user.user_metadata?.name || email
        const dbName = String(data?.name || '').trim()
        if (dbName) return dbName
        const metaName = user.user_metadata?.full_name || user.user_metadata?.name
        if (metaName) return metaName
        const dbEmail = String(data?.email || '').trim()
        return dbEmail || email
    } catch {
        return ''
    }
}

export function RatingStars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
    const w = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5'
    const rounded = Math.round(rating)
    return (
        <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} className={`${w} ${i <= rounded ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
            ))}
        </div>
    )
}

/* ─── Interactive Star Picker ─── */
function StarPicker({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
    const [hover, setHover] = useState(0)
    const activeValue = hover || value

    return (
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                    <button key={i} type="button"
                        disabled={disabled}
                        onMouseEnter={() => !disabled && setHover(i)}
                        onMouseLeave={() => !disabled && setHover(0)}
                        onClick={() => !disabled && onChange(i)}
                        className={`p-0.5 transition-transform ${disabled ? 'cursor-default' : 'hover:scale-110'}`}
                    >
                        <Star className={`w-6 h-6 transition-colors ${
                            i <= activeValue
                                ? 'text-amber-400 fill-amber-400'
                                : (disabled ? 'text-gray-200' : 'text-gray-300 hover:text-amber-200')
                        }`} />
                    </button>
                ))}
            </div>
            <div className="w-24 text-right shrink-0">
                {activeValue > 0 ? (
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${OVERALL_LABELS[activeValue]?.color || 'text-gray-500'}`}>
                        {OVERALL_LABELS[activeValue]?.label}
                    </span>
                ) : (
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-300">
                        Not Rated
                    </span>
                )}
            </div>
        </div>
    )
}

export function computePeriodLabel(periodType: string, dateStr: string, offset: number): string {
    if (!periodType || !dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return periodType;
    const [y, m, day] = parts.map(Number);
    let d = new Date(y, m - 1, day);
    
    const type = periodType.toLowerCase()

    if (type.includes('daily') || type.includes('giornal')) {
        d.setDate(d.getDate() + offset);
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (type.includes('week') || type.includes('settiman')) {
        d.setDate(d.getDate() + offset * 7);
        const dayOfWeek = d.getDay();
        const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const startOfWeek = new Date(y, m - 1, diff);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        return `${startOfWeek.getDate()} ${startOfWeek.toLocaleString('en-US', { month: 'short' })} - ${endOfWeek.getDate()} ${endOfWeek.toLocaleString('en-US', { month: 'short', year: 'numeric' })}`;
    }
    if (type.includes('month') || type.includes('mensil')) {
        d.setMonth(d.getMonth() + offset);
        return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }
    if (type.includes('quarter') || type.includes('trimestr')) {
        d.setMonth(d.getMonth() + offset * 3);
        const q = Math.floor(d.getMonth() / 3) + 1;
        return `Q${q} ${d.getFullYear()}`;
    }
    if (type.includes('semi-annual') || type.includes('semestr')) {
        d.setMonth(d.getMonth() + offset * 6);
        const h = Math.floor(d.getMonth() / 6) + 1;
        return `H${h} ${d.getFullYear()}`;
    }
    if (type.includes('annual') || type.includes('annua')) {
        d.setFullYear(d.getFullYear() + offset);
        return `${d.getFullYear()}`;
    }
    
    return periodType;
}

export interface PerformanceModalProps {
    open: boolean
    onClose: () => void
    onSave: (data: any) => Promise<void>
    review: HRStaffPerformance | null
    staffList: HRStaffMember[]
    allCategories: HRRatingCategory[]
    saving: boolean
    onDelete?: (id: string) => void
    preselectedStaffId?: string | null
    preselectedPeriod?: string
}

export default function PerformanceModal({ open, onClose, onSave, review, staffList, allCategories, saving, preselectedStaffId, preselectedPeriod, onDelete }: PerformanceModalProps) {
    const [isEditing, setIsEditing]       = useState(false)
    const [staffId, setStaffId]           = useState('')
    const [reviewDate, setReviewDate]     = useState('')
    const [reviewerName, setReviewerName] = useState('')
    const [period, setPeriod]             = useState('')
    const [categoryRatings, setCategoryRatings] = useState<Record<string, number>>({})
    const [strengths, setStrengths]       = useState('')
    const [improvements, setImprovements] = useState('')
    const [goals, setGoals]               = useState('')
    const [notes, setNotes]               = useState('')

    // Compute applicable categories based on selected staff member
    const selectedStaff = staffList.find(s => s.id === staffId)
    const applicableCategories = useMemo(() => {
        return allCategories.filter(c => {
            if (c.scope === 'global') return true
            if (c.scope === 'department' && selectedStaff?.department_id && c.scope_id === selectedStaff.department_id) return true
            if (c.scope === 'position' && selectedStaff?.position_id && c.scope_id === selectedStaff.position_id) return true
            return false
        })
    }, [allCategories, selectedStaff])

    const handleDateChange = (dateStr: string) => {
        setReviewDate(dateStr)
    }

    useEffect(() => {
        let alive = true
        if (review) {
            setIsEditing(false)
            setStaffId(review.staff_id)
            setReviewDate(review.review_date || '')
            setReviewerName(review.reviewer_name || '')
            setPeriod(review.period || '')
            setCategoryRatings(review.category_ratings || {})
            setStrengths(review.strengths || '')
            setImprovements(review.improvements || '')
            setGoals(review.goals || '')
            setNotes(review.notes || '')
        } else {
            setIsEditing(true)
            setStaffId(preselectedStaffId || ''); 
            const today = new Date().toISOString().slice(0, 10)
            setReviewDate(today)
            setReviewerName('')
            setPeriod(preselectedPeriod || computePeriodLabel('Quarterly', today, 0))
            
            // Auto-fill reviewer name
            ;(async () => {
                const name = await fetchCurrentUserNameFromDB()
                if (alive && name) setReviewerName(name)
            })()

            setCategoryRatings({})
            setStrengths(''); setImprovements(''); setGoals(''); setNotes('')
        }
        return () => {
            alive = false
        }
    }, [review, preselectedStaffId, preselectedPeriod])

    // Re-init category ratings when applicable categories change (for new reviews)
    useEffect(() => {
        if (!review && applicableCategories.length > 0) {
            setCategoryRatings(prev => {
                const next: Record<string, number> = {}
                applicableCategories.forEach(c => {
                    const key = labelToKey(c.label)
                    next[key] = prev[key] || 0
                })
                return next
            })
        }
    }, [applicableCategories, review])

    const overallAvg = computeAverage(categoryRatings)
    const ratedCount = Object.values(categoryRatings).filter(v => v > 0).length

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const roundedRating = Math.round(overallAvg) || 3
        await onSave({
            staff_id: staffId,
            review_date: reviewDate,
            reviewer_name: reviewerName.trim() || null,
            period: period.trim() || null,
            rating: roundedRating,
            category_ratings: categoryRatings,
            strengths: strengths.trim() || null,
            improvements: improvements.trim() || null,
            goals: goals.trim() || null,
            notes: notes.trim() || null,
        })
    }

    const setCatRating = (key: string, val: number) => {
        setCategoryRatings(prev => ({ ...prev, [key]: val }))
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {review ? 'Edit Performance Review' : 'New Performance Review'}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* ── Staff + Date ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member *</label>
                            <input type="text" readOnly disabled value={selectedStaff ? `${selectedStaff.full_name} — ${selectedStaff.position || 'No Pos'}` : ''}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-500 bg-gray-50 outline-none cursor-not-allowed" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Review Date *</label>
                            <input type="date" required value={reviewDate} onChange={e => handleDateChange(e.target.value)}
                                disabled={!isEditing}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-500" />
                        </div>
                    </div>

                    {/* ── Reviewer + Period ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Reviewer</label>
                            <input value={reviewerName} onChange={e => setReviewerName(e.target.value)}
                                placeholder="e.g. Manager Name"
                                disabled={!isEditing}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
                            <input disabled value={period}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 bg-gray-50 outline-none cursor-not-allowed" />
                        </div>
                    </div>

                    {/* Conditional Sections */}
                    {staffId && (
                        <>
                            {/* Category Ratings */}
                            <div className="border border-gray-200 rounded-xl overflow-hidden">
                                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-gray-800">Rating Categories</h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500">{ratedCount}/{applicableCategories.length} rated</span>
                                    </div>
                                </div>
                                {applicableCategories.length === 0 ? (
                                    <div className="px-4 py-8 text-center text-sm text-gray-400">
                                        No rating categories configured for this staff member
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {applicableCategories.map(cat => {
                                            const key = labelToKey(cat.label)
                                            return (
                                                <div key={cat.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50/50 transition">
                                                    <span className="text-sm text-gray-700 font-medium">{cat.label}</span>
                                                    <StarPicker
                                                        value={categoryRatings[key] || 0}
                                                        onChange={(v) => setCatRating(key, v)}
                                                        disabled={!isEditing}
                                                    />
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                                {/* Overall average bar */}
                                <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
                                    <span className="text-sm font-bold text-white">Overall Average</span>
                                    <div className="flex items-center gap-3">
                                        <RatingStars rating={overallAvg} size="md" />
                                        <span className={`text-lg font-bold ${
                                            overallAvg >= 4 ? 'text-emerald-400' :
                                            overallAvg >= 3 ? 'text-amber-400' :
                                            overallAvg > 0 ? 'text-red-400' : 'text-gray-400'
                                        }`}>
                                            {overallAvg > 0 ? overallAvg.toFixed(1) : '—'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* ── Strengths + Improvements ── */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        <span className="inline-flex items-center gap-1.5">
                                            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                                            Strengths
                                        </span>
                                    </label>
                                    <textarea value={strengths} onChange={e => setStrengths(e.target.value)} rows={3}
                                        placeholder="Key strengths observed during this period…"
                                        disabled={!isEditing}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none disabled:bg-gray-50 disabled:text-gray-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        <span className="inline-flex items-center gap-1.5">
                                            <TrendingDown className="w-3.5 h-3.5 text-orange-500" />
                                            Areas for Improvement
                                        </span>
                                    </label>
                                    <textarea value={improvements} onChange={e => setImprovements(e.target.value)} rows={3}
                                        placeholder="Areas that need improvement…"
                                        disabled={!isEditing}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none disabled:bg-gray-50 disabled:text-gray-500" />
                                </div>
                            </div>

                            {/* ── Goals ── */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Goals for Next Period</label>
                                <textarea value={goals} onChange={e => setGoals(e.target.value)} rows={2}
                                    placeholder="Objectives and targets for the next review period…"
                                    disabled={!isEditing}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none disabled:bg-gray-50 disabled:text-gray-500" />
                            </div>

                            {/* ── Notes ── */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
                                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                                    disabled={!isEditing}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none disabled:bg-gray-50 disabled:text-gray-500" />
                            </div>
                        </>
                    )}

                    {/* ── Actions ── */}
                    <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                        <div>
                            {review && isEditing && onDelete && (
                                <button type="button" onClick={() => {
                                    onClose()
                                    onDelete(review.id)
                                }}
                                    className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition flex items-center gap-1.5 border border-red-100">
                                    <Trash2 className="w-4 h-4" />
                                    Delete
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            {(!review || isEditing) && (
                                <button type="button" onClick={(e) => {
                                    e.preventDefault()
                                    if (review) setIsEditing(false)
                                    else onClose()
                                }}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                                    Cancel
                                </button>
                            )}
                            {(review && !isEditing) && (
                                <button type="button" onClick={(e) => {
                                    e.preventDefault()
                                    onClose()
                                }}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                                    Close
                                </button>
                            )}
                            
                            {review && !isEditing && (
                                <button type="button" onClick={(e) => {
                                    e.preventDefault()
                                    setIsEditing(true)
                                }}
                                    className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-lg transition flex items-center gap-1.5">
                                    <Pencil className="w-4 h-4" />
                                    Edit
                                </button>
                            )}
                            {(!review || isEditing) && (
                                <button type="submit" disabled={saving || !staffId}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
                                    {saving ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Plus className="w-4 h-4" />
                                    )}
                                    {review ? 'Update Review' : 'Create Review'}
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}
