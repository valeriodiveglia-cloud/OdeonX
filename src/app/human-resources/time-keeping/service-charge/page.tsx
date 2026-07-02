'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffMember, HRServiceCharge, HRServiceChargeStaff } from '@/types/human-resources'
import { Save, Receipt, Loader2, Coins, ChevronDown } from 'lucide-react'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import MonthPicker from '@/components/MonthPicker'

function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }

export default function ServiceChargeMonthlyPage() {
    const { currency, language } = useSettings()
    const [currentDate, setCurrentDate] = useState(() => new Date())
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [selectedCity, setSelectedCity] = useState<'Ho Chi Minh' | 'Da Lat'>('Ho Chi Minh')
    const [cityDropdownOpen, setCityDropdownOpen] = useState(false)

    // Data
    const [staffList, setStaffList] = useState<HRStaffMember[]>([])
    const [serviceCharge, setServiceCharge] = useState<HRServiceCharge | null>(null)
    const [staffRecords, setStaffRecords] = useState<Record<string, HRServiceChargeStaff>>({})
    
    // UI State for edits
    const [totalAmountInput, setTotalAmountInput] = useState<string>('0')
    const [hoursInput, setHoursInput] = useState<Record<string, string>>({})

    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const monthId = `${monthStart.getFullYear()}-${(monthStart.getMonth() + 1).toString().padStart(2, '0')}`

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            // Fetch active staff (excluding outsourced)
            const { data: staffRes, error: staffErr } = await supabase
                .from('hr_staff')
                .select('*')
                .eq('status', 'active')
                .neq('employment_type', 'outsourced')
                .order('full_name')
            if (staffErr) throw staffErr

            // Fetch Service charge info for month and city
            const { data: scRes, error: scErr } = await supabase
                .from('hr_service_charges')
                .select('*')
                .eq('month_id', monthId)
                .eq('city', selectedCity)
                .maybeSingle()
            if (scErr && scErr.code !== 'PGRST116') throw scErr

            // Fetch SC staff records for month and city
            const { data: recRes, error: recErr } = await supabase
                .from('hr_service_charge_staff')
                .select('*')
                .eq('month_id', monthId)
                .eq('city', selectedCity)
            if (recErr) throw recErr

            setStaffList((staffRes as HRStaffMember[]) || [])
            setServiceCharge(scRes || null)
            if (scRes && scRes.total_amount != null) {
                const parts = scRes.total_amount.toString().split('.')
                parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                setTotalAmountInput(parts.join('.'))
            } else {
                setTotalAmountInput('')
            }

            const recMap: Record<string, HRServiceChargeStaff> = {}
            const hoursMap: Record<string, string> = {}
            if (recRes) {
                recRes.forEach((r: HRServiceChargeStaff) => {
                    recMap[r.staff_id] = r
                    hoursMap[r.staff_id] = r.hours_worked.toString()
                })
            }
            // Populate defaults for staff that don't have records yet
            staffRes?.forEach(s => {
                if (!hoursMap[s.id]) {
                    hoursMap[s.id] = '0'
                }
            })

            setStaffRecords(recMap)
            setHoursInput(hoursMap)
        } catch (err) {
            console.error('Error fetching service charge data:', err)
        }
        setLoading(false)
    }, [monthId, selectedCity])

    useEffect(() => { fetchAll() }, [fetchAll])

    const filteredStaff = useMemo(() => {
        return staffList.filter(s => {
            if (selectedCity === 'Ho Chi Minh') {
                return s.city === 'Ho Chi Minh' || !s.city
            }
            return s.city === selectedCity
        })
    }, [staffList, selectedCity])

    // Calculations
    const totalSC = Number(totalAmountInput.replace(/,/g, '')) || 0
    const totalHours = useMemo(() => {
        return filteredStaff.reduce((sum, s) => sum + (Number(hoursInput[s.id]) || 0), 0)
    }, [hoursInput, filteredStaff])
    
    const hourlyRate = totalHours > 0 ? (totalSC / totalHours) : 0

    const handleSave = async () => {
        setSaving(true)
        try {
            // Upsert main SC
            const { error: scErr } = await supabase
                .from('hr_service_charges')
                .upsert({ month_id: monthId, city: selectedCity, total_amount: totalSC }, { onConflict: 'month_id,city' })
            if (scErr) throw scErr

            // Upsert staff hours
            const upsertArray = filteredStaff.map(st => {
                const existing = staffRecords[st.id]
                return {
                    ...(existing ? { id: existing.id } : {}),
                    month_id: monthId,
                    city: selectedCity,
                    staff_id: st.id,
                    hours_worked: Number(hoursInput[st.id]) || 0
                }
            })

            if (upsertArray.length > 0) {
                const { error: staffErr } = await supabase
                    .from('hr_service_charge_staff')
                    .upsert(upsertArray, { onConflict: 'month_id,staff_id' })
                if (staffErr) throw staffErr
            }
            
            await fetchAll()
            const successMsg = language === 'vi' ? 'Đã lưu thành công!' : 'Saved successfully!'
            alert(successMsg)
        } catch (err) {
            console.error(err)
            const errorMsg = language === 'vi' ? 'Lỗi khi lưu dữ liệu' : 'Error saving data'
            alert(errorMsg)
        } finally {
            setSaving(false)
        }
    }

    if (loading && staffList.length === 0) {
        return <div className="min-h-screen bg-[#0b1530] flex items-center justify-center"><CircularLoader /></div>
    }

    return (
        <div className="min-h-screen bg-[#0b1530] text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto">
                <div className="mb-6 ml-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                            {language === 'vi' ? 'Phí Dịch Vụ' : 'Service Charge'}
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">
                            {language === 'vi' 
                                ? 'Phân bổ đều quỹ phí dịch vụ hàng tháng dựa trên số giờ làm việc.' 
                                : 'Equitably distribute monthly service charge pools based on working hours.'}
                        </p>
                    </div>
                    <button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition-all shadow hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 
                        {language === 'vi' ? 'Lưu thay đổi' : 'Save Changes'}
                    </button>
                </div>

                {/* 1. City Selection Dropdown (White Theme) - rounded-lg, compatto (w-36) */}
                <div className="mb-8 px-2 flex items-center gap-3 relative z-20">
                    <span className="text-sm font-semibold text-slate-400">{language === 'vi' ? 'Thành phố:' : 'City:'}</span>
                    <div className="relative inline-block text-left">
                        <button
                            type="button"
                            onClick={() => setCityDropdownOpen(!cityDropdownOpen)}
                            className="inline-flex justify-between items-center gap-2 w-36 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 hover:bg-gray-50 transition-all focus:ring-2 focus:ring-blue-500/50 outline-none"
                        >
                            <span className="truncate">{selectedCity}</span>
                            <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                        </button>

                        {cityDropdownOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setCityDropdownOpen(false)} />
                                <div className="absolute left-0 mt-2 w-36 rounded-lg bg-white border border-gray-200 shadow-xl z-20 focus:outline-none overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100">
                                    <div className="py-1">
                                        <button
                                            onClick={() => {
                                                setSelectedCity('Ho Chi Minh')
                                                setCityDropdownOpen(false)
                                            }}
                                            className={`w-full text-left px-3 py-2 text-sm font-semibold transition-colors ${
                                                selectedCity === 'Ho Chi Minh'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            Ho Chi Minh
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedCity('Da Lat')
                                                setCityDropdownOpen(false)
                                            }}
                                            className={`w-full text-left px-3 py-2 text-sm font-semibold transition-colors ${
                                                selectedCity === 'Da Lat'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            Da Lat
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* 2. MonthPicker a larghezza intera / posizionato da solo sotto il dropdown con spaziature aumentate */}
                <MonthPicker
                    value={toMonthInputValue(currentDate)}
                    onChange={(val) => {
                        const d = fromMonthInputValue(val)
                        if (d) setCurrentDate(d)
                    }}
                    language={language}
                    colorClass="text-blue-100 hover:text-white"
                    labelColorClass="text-white"
                    iconColorClass="text-blue-200 hover:text-white"
                    className="mt-6 mb-8 px-2"
                />

                {/* Simple SC Input Bar (Dark Theme Card + White Input Box) - rounded-lg */}
                <div className="mb-6 flex items-center justify-between bg-slate-900/40 rounded-lg p-4 border border-slate-800/80 relative overflow-hidden">
                    <div className="flex items-center gap-3 text-gray-100 relative z-10">
                        <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700">
                            <Receipt className="w-5 h-5 text-slate-300" />
                        </div>
                        <div>
                            <span className="font-bold block text-sm text-white">{language === 'vi' ? 'Quỹ Phí Dịch Vụ Hàng Tháng' : 'Monthly Service Charge Pool'}</span>
                            <span className="text-xs text-slate-400 font-medium">
                                {language === 'vi'
                                    ? `Tự động phân bổ trên tổng số ${totalHours.toFixed(1)} giờ cho ${selectedCity}`
                                    : `Auto-distributes across total ${totalHours.toFixed(1)} hours for ${selectedCity}`}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center relative z-10">
                        <span className="text-slate-400 font-semibold mr-2">{currency}</span>
                        <input 
                            type="text" 
                            value={totalAmountInput}
                            onChange={(e) => {
                                let val = e.target.value.replace(/[^0-9.]/g, '')
                                if (val.startsWith('0') && !val.startsWith('0.')) {
                                    val = val.replace(/^0+/, '')
                                }
                                const parts = val.split('.')
                                if (parts.length > 2) parts.pop()
                                parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                                setTotalAmountInput(parts.join('.'))
                            }}
                            className="w-36 px-3 py-2 text-right bg-white border border-gray-250 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all outline-none"
                            placeholder="0"
                        />
                    </div>
                </div>

                {/* Table Area - rounded-lg */}
                <div className="rounded-lg bg-white shadow-xl overflow-hidden border border-gray-100">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="px-5 py-4 text-left font-semibold text-gray-500 uppercase tracking-widest text-xs">
                                        {language === 'vi' ? 'Nhân viên' : 'Staff Member'}
                                    </th>
                                    <th className="px-5 py-4 text-left font-semibold text-gray-500 uppercase tracking-widest text-xs">
                                        {language === 'vi' ? 'Chức vụ' : 'Position'}
                                    </th>
                                    <th className="px-5 py-4 text-left font-semibold text-gray-500 uppercase tracking-widest text-xs">
                                        {language === 'vi' ? 'Hợp đồng' : 'Contract'}
                                    </th>
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs border-l border-gray-100 w-48">
                                        {language === 'vi' ? 'Số giờ làm' : 'Hours Worked'}
                                    </th>
                                    <th className="px-5 py-4 text-center font-semibold text-gray-500 uppercase tracking-widest text-xs border-l border-gray-100">
                                        {language === 'vi' ? 'Tỷ lệ %' : 'Share %'}
                                    </th>
                                    <th className="px-5 py-4 text-right font-semibold text-gray-500 uppercase tracking-widest text-xs border-l border-gray-100 w-48">
                                        {language === 'vi' ? 'Phần được chia' : 'Calculated Portion'}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStaff.map((s, idx) => {
                                    const hStr = hoursInput[s.id]
                                    const h = Number(hStr) || 0
                                    const sharePct = totalHours > 0 ? (h / totalHours) * 100 : 0
                                    const portion = h * hourlyRate

                                    return (
                                        <tr 
                                            key={s.id} 
                                            className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                                        >
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-indigo-800 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm">
                                                        {(s.full_name || '').split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <span className="text-sm font-semibold text-gray-900 block">{s.full_name}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-gray-500 text-sm">
                                                {s.position}
                                            </td>
                                            <td className="px-5 py-4">
                                                {s.employment_type === 'full_time' && (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                                                        {language === 'vi' ? 'Toàn thời gian' : 'Full-time'}
                                                    </span>
                                                )}
                                                {s.employment_type === 'part_time' && (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                                                        {language === 'vi' ? 'Bán thời gian' : 'Part-time'}
                                                    </span>
                                                )}
                                                {!s.employment_type && (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-50 text-gray-500 border border-gray-100">
                                                        -
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-center border-l border-gray-100">
                                                <div className="flex items-center justify-center">
                                                    <input 
                                                        type="number" min="0" step="0.5"
                                                        value={hStr === '0' ? '' : hStr}
                                                        placeholder="0"
                                                        onChange={e => setHoursInput(p => ({...p, [s.id]: e.target.value }))}
                                                        className="w-24 px-3 py-2 text-center border mr-2 border-gray-200 rounded-lg text-sm text-gray-900 font-bold focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all outline-none bg-white"
                                                    />
                                                    <span className="text-gray-400 font-medium text-xs">h</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-center border-l border-gray-100">
                                                <div className="flex flex-col items-center">
                                                    <span className={`font-bold ${sharePct > 0 ? 'text-gray-700' : 'text-gray-300'}`}>{sharePct.toFixed(1)}%</span>
                                                    <div className="w-20 h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                                                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(sharePct, 100)}%` }} />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-right border-l border-gray-100">
                                                <span className={`text-sm font-semibold ${portion > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                                                    {new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(portion)}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                                {filteredStaff.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-16 text-center">
                                            <Coins className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                            <p className="text-gray-500 text-sm font-medium">
                                                {language === 'vi'
                                                    ? `Không tìm thấy nhân sự đang hoạt động tại ${selectedCity}.`
                                                    : `No active staff members found for ${selectedCity}.`}
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
