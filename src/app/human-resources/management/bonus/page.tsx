'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffMember, HRStaffContract } from '@/types/human-resources'
import { Search, X, Loader2, Users, Star, ChevronLeft, ChevronRight, FileDown } from 'lucide-react'
import { saveAs } from 'file-saver'
import { useSettings } from '@/contexts/SettingsContext'

// --- Helpers ---
function calculateTenure(startStr: string, endStr: string | Date) {
    const start = new Date(startStr);
    const end = typeof endStr === 'string' ? new Date(endStr) : endStr;
    
    if (start > end) return { totalDays: 0, months: 0, years: 0 };
    
    const utc1 = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const utc2 = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    const totalDays = Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
    
    const years = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);
    
    return { totalDays, months, years };
}

function formatTenure(t: { totalDays: number, months: number, years: number }, language?: string) {
    const isVi = language === 'vi';
    if (t.totalDays === 0) return isVi ? '0 ngày' : '0 days';
    if (t.years > 0) {
        if (t.months > 0) return isVi ? `${t.years} năm ${t.months} tháng` : `${t.years} yr ${t.months} mo`;
        return isVi ? `${t.years} năm` : `${t.years} yr`;
    }
    if (t.months > 0) {
        return isVi ? `${t.months} tháng` : `${t.months} mo`;
    }
    return isVi ? `${t.totalDays} ngày` : `${t.totalDays} days`;
}

function get14thMonthMultiplier(years: number, baseYears: number, steps: { years: number, pct: number }[]) {
    if (years < baseYears) return 0;
    if (steps.length === 0) return 0;
    
    let applicablePct = 0;
    const sortedSteps = [...steps].sort((a, b) => a.years - b.years);
    for (const step of sortedSteps) {
        if (years >= step.years) {
            applicablePct = step.pct;
        } else {
            break;
        }
    }
    return applicablePct / 100;
}

// Calculates the base 13th month bonus (Total Basic Salary Earned in Period / 12)
function calculateBaseBonus(staff: HRStaffMember, periodStart: Date, periodEnd: Date) {
    const contracts = (staff.hr_staff_contracts || [])
        .filter(c => c.signing_date)
        .sort((a, b) => new Date(a.signing_date!).getTime() - new Date(b.signing_date!).getTime());

    const pStart = new Date(Math.max(new Date(staff.start_date || new Date()).getTime(), periodStart.getTime()));
    const pEnd = periodEnd;

    if (pStart > pEnd) return 0;

    let totalEarned = 0;
    let current = new Date(pStart);
    current.setHours(0, 0, 0, 0);
    pEnd.setHours(23, 59, 59, 999);

    while (current <= pEnd) {
        let activeSalary = (staff as any).basic_salary || staff.salary_amount || 0;
        let activeContract = null;
        for (const c of contracts) {
            const signing = new Date(c.signing_date!);
            signing.setHours(0, 0, 0, 0);
            if (signing <= current) {
                activeContract = c;
            }
        }
        
        if (activeContract && activeContract.basic_salary) {
            activeSalary = activeContract.basic_salary;
        }

        const dailySalary = (activeSalary * 12) / 365;
        totalEarned += dailySalary;

        current.setDate(current.getDate() + 1);
    }

    return totalEarned / 12;
}

function calculatePartTimeBonus(hours: number, maxCap: number, targetHours: number, minHours: number) {
    if (hours >= targetHours) return maxCap;
    if (hours < minHours) return 0;
    return hours * (maxCap / targetHours);
}

const fmtCurrency = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n))

function ExportModalYear({ onClose, onExport, currentYear, language }: { onClose: () => void, onExport: (year: number) => void, currentYear: number, language?: string }) {
    const [range, setRange] = useState<'current' | 'prev' | 'custom'>('current')
    const [customYear, setCustomYear] = useState<number>(currentYear)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{language === 'vi' ? 'Xuất dữ liệu thưởng' : 'Export Bonus Data'}</h3>
                
                <div className="space-y-3 mb-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={range === 'current'} onChange={() => setRange('current')} className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">{language === 'vi' ? `Năm hiện tại (${currentYear})` : `Current Year (${currentYear})`}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={range === 'prev'} onChange={() => setRange('prev')} className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">{language === 'vi' ? `Năm trước (${currentYear - 1})` : `Previous Year (${currentYear - 1})`}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={range === 'custom'} onChange={() => setRange('custom')} className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">{language === 'vi' ? 'Năm tùy chỉnh' : 'Custom Year'}</span>
                    </label>

                    {range === 'custom' && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                            <label className="block text-xs text-gray-500 mb-1">{language === 'vi' ? 'Chọn năm' : 'Select Year'}</label>
                            <input type="number" min={2024} max={currentYear} value={customYear} onChange={e => setCustomYear(parseInt(e.target.value))} className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">{language === 'vi' ? 'Hủy' : 'Cancel'}</button>
                    <button 
                        onClick={() => {
                            if (range === 'current') onExport(currentYear)
                            else if (range === 'prev') onExport(currentYear - 1)
                            else onExport(customYear)
                        }} 
                        disabled={range === 'custom' && !customYear}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                    >
                        <FileDown className="w-4 h-4" />
                        {language === 'vi' ? 'Xuất' : 'Export'}
                    </button>
                </div>
            </div>
        </div>
    )
}

type TabKey = 'full_time' | 'part_time';

export default function BonusPage() {
    const { 
        language,
        hrBonus14thBaseYears, hrBonus14thSteps, hrBonusPtMaxCap, hrBonusPtTargetHours, hrBonusPtMinHours,
        hrBonusPtMinRating, hrBonus14thMinRating, hrBonus13thGuaranteedPct, hrBonus13thPerfPct, hrBonus13thPerfTiers
    } = useSettings()
    const [loading, setLoading] = useState(true)
    const [staffList, setStaffList] = useState<HRStaffMember[]>([])
    const [ptHours, setPtHours] = useState<Record<string, string>>({}) // staff_id -> total_hours as string
    const [performanceReviews, setPerformanceReviews] = useState<any[]>([])
    
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState<number>(currentYear)
    const [search, setSearch] = useState('')
    const [activeTab, setActiveTab] = useState<TabKey>('full_time')
    const [exportModalOpen, setExportModalOpen] = useState(false)

    const fetchAllData = async (year: number) => {
        setLoading(true)
        try {
            const [staffRes, hoursRes, perfRes] = await Promise.all([
                supabase.from('hr_staff').select('*, hr_staff_contracts(*)').eq('status', 'active').order('full_name'),
                supabase.from('hr_part_time_hours').select('*').eq('year', year),
                supabase.from('hr_staff_performance').select('*').like('period', `%${year}%`)
            ]);
            
            if (staffRes.error) throw staffRes.error;
            setStaffList(staffRes.data as HRStaffMember[]);
            
            if (hoursRes.data) {
                const hoursMap: Record<string, string> = {};
                hoursRes.data.forEach(row => {
                    hoursMap[row.staff_id] = (row.total_hours ?? 0).toString();
                });
                setPtHours(hoursMap);
            }
            if (perfRes.data) {
                setPerformanceReviews(perfRes.data);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchAllData(selectedYear);
    }, [selectedYear]);

    const getStaffAverageRating = useCallback((staffId: string) => {
        const reviews = performanceReviews.filter(r => r.staff_id === staffId);
        if (reviews.length === 0) return 0;
        const total = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
        return total / reviews.length;
    }, [performanceReviews]);

    const handleUpdateHours = async (staffId: string, hoursStr: string) => {
        const h = parseFloat(hoursStr) || 0;
        
        // Update local state immediately for fast feedback
        setPtHours(prev => ({ ...prev, [staffId]: h.toString() }));
        
        // Save to DB
        const { error } = await supabase
            .from('hr_part_time_hours')
            .upsert({ 
                staff_id: staffId, 
                year: selectedYear, 
                total_hours: h 
            }, { onConflict: 'staff_id,year' });
            
        if (error) {
            console.error("Failed to save hours:", error.message || error, JSON.stringify(error));
        }
    };

    const filteredStaff = useMemo(() => {
        let list = staffList;
        if (activeTab === 'full_time') {
            list = list.filter(s => s.employment_type === 'full_time');
        } else {
            list = list.filter(s => s.employment_type === 'part_time');
        }
        
        if (!search.trim()) return list;
        const q = search.toLowerCase();
        return list.filter(s => 
            s.full_name?.toLowerCase().includes(q) || 
            s.position?.toLowerCase().includes(q)
        );
    }, [staffList, search, activeTab]);

    const today = new Date();
    const yearEnd = new Date(selectedYear, 11, 31);
    const yearStart = new Date(selectedYear, 0, 1);
    
    const evaluationEndDate = selectedYear === currentYear ? today : yearEnd;
    const availableYears = Array.from({ length: Math.max(2, currentYear - 2024 + 2) }, (_, i) => 2024 + i);

    const totals = useMemo(() => {
        let ftCurrent = 0;
        let ftProjected = 0;
        let ptCurrent = 0;
        let ptProjected = 0;

        staffList.forEach(staff => {
            const effectiveStartDate = new Date(Math.max(new Date(staff.start_date || new Date()).getTime(), yearStart.getTime()));
            const workedThisYear = effectiveStartDate <= evaluationEndDate;
            if (!workedThisYear) return;

            const avgRating = getStaffAverageRating(staff.id);
            const hasReviews = performanceReviews.some(r => r.staff_id === staff.id);

            if (staff.employment_type === 'full_time') {
                const totalTenureCurrent = calculateTenure(staff.start_date || new Date().toISOString(), evaluationEndDate);
                const totalTenureProjected = calculateTenure(staff.start_date || new Date().toISOString(), yearEnd);
                
                const calcFullTime = (endDate: Date, tenureYears: number, isProjected: boolean) => {
                    const pureBase = calculateBaseBonus(staff, yearStart, endDate);
                    const guaranteedPart = pureBase * (hrBonus13thGuaranteedPct / 100);
                    const perfPart = pureBase * (hrBonus13thPerfPct / 100);
                    
                    let tierMult = 0;
                    if (isProjected) {
                        tierMult = 1;
                    } else {
                        if (hasReviews) {
                            const matched = [...hrBonus13thPerfTiers].filter(t => avgRating >= t.min_rating).sort((a,b) => b.min_rating - a.min_rating);
                            if (matched.length > 0) tierMult = matched[0].multiplier_pct / 100;
                        } else {
                            tierMult = 1; 
                        }
                    }
                    
                    const final13th = guaranteedPart + (perfPart * tierMult);
                    const passes14thGate = isProjected || (!hasReviews || avgRating >= hrBonus14thMinRating);
                    const mult14th = get14thMonthMultiplier(tenureYears, hrBonus14thBaseYears, hrBonus14thSteps);
                    const raw14th = final13th * mult14th;
                    const final14th = passes14thGate ? raw14th : 0;
                    return final13th + final14th;
                };

                ftCurrent += calcFullTime(evaluationEndDate, totalTenureCurrent.years, false);
                ftProjected += calcFullTime(yearEnd, totalTenureProjected.years, true);
            } else {
                const hoursRaw = ptHours[staff.id];
                const hours = hoursRaw === undefined ? 0 : (parseFloat(hoursRaw) || 0);
                const pureBonus = calculatePartTimeBonus(hours, hrBonusPtMaxCap, hrBonusPtTargetHours, hrBonusPtMinHours);
                
                const passesGate = !hasReviews || avgRating >= hrBonusPtMinRating;
                ptCurrent += passesGate ? pureBonus : 0;
                ptProjected += selectedYear === currentYear ? hrBonusPtMaxCap : pureBonus;
            }
        });

        return {
            ftCurrent, ftProjected,
            ptCurrent, ptProjected,
            grandCurrent: ftCurrent + ptCurrent,
            grandProjected: ftProjected + ptProjected
        };
    }, [staffList, ptHours, performanceReviews, hrBonus13thGuaranteedPct, hrBonus13thPerfPct, hrBonus13thPerfTiers, hrBonus14thMinRating, hrBonus14thBaseYears, hrBonus14thSteps, hrBonusPtMaxCap, hrBonusPtTargetHours, hrBonusPtMinHours, hrBonusPtMinRating, yearStart, yearEnd, evaluationEndDate, selectedYear, currentYear, getStaffAverageRating]);

    const handleExport = async (exportYear: number) => {
        let exportPtHours = ptHours;
        let exportPerfReviews = performanceReviews;

        if (exportYear !== selectedYear) {
            const [hoursRes, perfRes] = await Promise.all([
                supabase.from('hr_part_time_hours').select('*').eq('year', exportYear),
                supabase.from('hr_staff_performance').select('*').like('period', `%${exportYear}%`)
            ]);
            
            if (hoursRes.data) {
                const hoursMap: Record<string, string> = {};
                hoursRes.data.forEach(row => {
                    hoursMap[row.staff_id] = (row.total_hours ?? 0).toString();
                });
                exportPtHours = hoursMap;
            } else {
                exportPtHours = {}
            }
            if (perfRes.data) {
                exportPerfReviews = perfRes.data;
            } else {
                exportPerfReviews = []
            }
        }

        const eYearStart = new Date(exportYear, 0, 1);
        const eYearEnd = new Date(exportYear, 11, 31);
        const eEvaluationEndDate = exportYear === currentYear ? new Date() : eYearEnd;

        const getExportStaffAverageRating = (staffId: string) => {
            const reviews = exportPerfReviews.filter(r => r.staff_id === staffId);
            if (reviews.length === 0) return 0;
            const total = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
            return total / reviews.length;
        };

        const ExcelJS = (await import('exceljs')).default
        const workbook = new ExcelJS.Workbook()
        
        const ftSheet = workbook.addWorksheet(language === 'vi' ? 'Toàn thời gian' : 'Full-Time')
        const ptSheet = workbook.addWorksheet(language === 'vi' ? 'Bán thời gian' : 'Part-Time')

        ftSheet.columns = [
            { header: language === 'vi' ? 'Họ và tên' : 'Name', key: 'name', width: 25 },
            { header: language === 'vi' ? 'Chức vụ' : 'Position', key: 'position', width: 25 },
            { header: language === 'vi' ? 'Tổng số ngày làm việc' : 'Total Work Days', key: 'days', width: 18 },
            { header: language === 'vi' ? `Thưởng tháng 13 (${exportYear})` : `13th Month (${exportYear})`, key: 'bonus13', width: 20, style: { numFmt: '#,##0' } },
            { header: language === 'vi' ? `Thưởng tháng 14 (${exportYear})` : `14th Month (${exportYear})`, key: 'bonus14', width: 20, style: { numFmt: '#,##0' } },
            { header: language === 'vi' ? 'Tổng tiền thưởng hiện tại' : 'Total Current Bonus', key: 'total', width: 20, style: { numFmt: '#,##0' } }
        ]

        ptSheet.columns = [
            { header: language === 'vi' ? 'Họ và tên' : 'Name', key: 'name', width: 25 },
            { header: language === 'vi' ? 'Chức vụ' : 'Position', key: 'position', width: 25 },
            { header: language === 'vi' ? 'Tổng số giờ' : 'Total Hours', key: 'hours', width: 15 },
            { header: language === 'vi' ? `Thưởng hiện tại (${exportYear})` : `Current Bonus (${exportYear})`, key: 'bonus', width: 20, style: { numFmt: '#,##0' } }
        ]

        ftSheet.getRow(1).font = { bold: true }
        ftSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }
        ptSheet.getRow(1).font = { bold: true }
        ptSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }

        staffList.forEach(staff => {
            const effectiveStartDate = new Date(Math.max(new Date(staff.start_date || new Date()).getTime(), eYearStart.getTime()));
            const workedThisYear = effectiveStartDate <= eEvaluationEndDate;
            if (!workedThisYear) return;

            const avgRating = getExportStaffAverageRating(staff.id);
            const hasReviews = exportPerfReviews.some(r => r.staff_id === staff.id);

            if (staff.employment_type === 'full_time') {
                const totalTenureCurrent = calculateTenure(staff.start_date || new Date().toISOString(), eEvaluationEndDate);
                const tenureInYear = calculateTenure(effectiveStartDate.toISOString(), eEvaluationEndDate);

                const pureBase = calculateBaseBonus(staff, eYearStart, eEvaluationEndDate);
                const guaranteedPart = pureBase * (hrBonus13thGuaranteedPct / 100);
                const perfPart = pureBase * (hrBonus13thPerfPct / 100);
                
                let tierMult = 1;
                if (hasReviews) {
                    const matched = [...hrBonus13thPerfTiers].filter(t => avgRating >= t.min_rating).sort((a,b) => b.min_rating - a.min_rating);
                    if (matched.length > 0) tierMult = matched[0].multiplier_pct / 100;
                }
                
                const final13th = guaranteedPart + (perfPart * tierMult);
                const passes14thGate = (!hasReviews || avgRating >= hrBonus14thMinRating);
                const mult14th = get14thMonthMultiplier(totalTenureCurrent.years, hrBonus14thBaseYears, hrBonus14thSteps);
                const final14th = passes14thGate ? (final13th * mult14th) : 0;

                ftSheet.addRow({
                    name: staff.full_name || '',
                    position: staff.position || '',
                    days: tenureInYear.totalDays,
                    bonus13: final13th,
                    bonus14: final14th,
                    total: final13th + final14th
                })
            } else {
                const hoursRaw = exportPtHours[staff.id];
                const hours = hoursRaw === undefined ? 0 : (parseFloat(hoursRaw) || 0);
                const pureBonus = calculatePartTimeBonus(hours, hrBonusPtMaxCap, hrBonusPtTargetHours, hrBonusPtMinHours);
                const passesGate = !hasReviews || avgRating >= hrBonusPtMinRating;
                const ptCurrent = passesGate ? pureBonus : 0;

                ptSheet.addRow({
                    name: staff.full_name || '',
                    position: staff.position || '',
                    hours: hours,
                    bonus: ptCurrent
                })
            }
        });

        const buffer = await workbook.xlsx.writeBuffer()
        saveAs(new Blob([buffer]), language === 'vi' ? `Bao_cao_thuong_${exportYear}.xlsx` : `Bonus_Export_${exportYear}.xlsx`)
        
        setExportModalOpen(false)
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>

    return (
        <div className="min-h-screen text-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">{language === 'vi' ? 'Quản lý tiền thưởng' : 'Bonus Management'}</h1>
                        <p className="text-sm text-slate-400 mt-1">{language === 'vi' ? 'Theo dõi thâm niên nhân viên và tính điều kiện nhận tiền thưởng cho năm đã chọn.' : 'Track staff tenure and calculate bonus eligibility for the selected year.'}</p>
                    </div>
                    <button 
                        onClick={() => setExportModalOpen(true)}
                        className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 shadow-sm"
                    >
                        <FileDown className="w-4 h-4" /> {language === 'vi' ? 'Xuất' : 'Export'}
                    </button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-slate-800 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
                        <div className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div> {language === 'vi' ? 'Thưởng toàn thời gian' : 'Full-Time Bonus'}
                        </div>
                        <div>
                            <div className="text-xl font-bold text-white">{fmtCurrency(totals.ftCurrent)} <span className="text-[10px] font-normal text-slate-500 font-mono">VND</span></div>
                            <div className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                                <span>{language === 'vi' ? 'Tối đa dự kiến:' : 'Projected max:'}</span>
                                <span className="font-medium text-blue-400">{fmtCurrency(totals.ftProjected)} <span className="text-[10px] font-normal">VND</span></span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-800 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
                        <div className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div> {language === 'vi' ? 'Thưởng bán thời gian' : 'Part-Time Bonus'}
                        </div>
                        <div>
                            <div className="text-xl font-bold text-white">{fmtCurrency(totals.ptCurrent)} <span className="text-[10px] font-normal text-slate-500 font-mono">VND</span></div>
                            <div className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                                <span>{language === 'vi' ? 'Tối đa dự kiến:' : 'Projected max:'}</span>
                                <span className="font-medium text-emerald-400">{fmtCurrency(totals.ptProjected)} <span className="text-[10px] font-normal">VND</span></span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gradient-to-br from-indigo-900/40 to-blue-900/40 border border-indigo-500/20 rounded-xl p-4 flex flex-col justify-between">
                        <div className="text-sm font-medium text-indigo-200 mb-2 flex items-center gap-2">
                            <Star className="w-3.5 h-3.5 text-indigo-400 fill-current" /> {language === 'vi' ? 'Tổng nghĩa vụ chi trả' : 'Grand Total Liability'}
                        </div>
                        <div>
                            <div className="text-2xl font-black text-white">{fmtCurrency(totals.grandCurrent)} <span className="text-[10px] font-normal text-indigo-300/50 font-mono">VND</span></div>
                            <div className="text-xs text-indigo-300/70 mt-1 flex items-center justify-between">
                                <span>{language === 'vi' ? 'Tối đa tuyệt đối dự kiến:' : 'Projected absolute max:'}</span>
                                <span className="font-bold text-indigo-300">{fmtCurrency(totals.grandProjected)} <span className="text-[10px] font-normal">VND</span></span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters & Tabs */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div className="flex bg-slate-800/50 p-1 rounded-lg border border-white/10">
                        <button 
                            onClick={() => setActiveTab('full_time')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'full_time' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                        >
                            {language === 'vi' ? 'Toàn thời gian' : 'Full-Time'}
                        </button>
                        <button 
                            onClick={() => setActiveTab('part_time')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'part_time' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                        >
                            {language === 'vi' ? 'Bán thời gian' : 'Part-Time'}
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="text" placeholder={language === 'vi' ? 'Tìm kiếm nhân viên...' : 'Search staff...'} value={search} onChange={e => setSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none" />
                            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10"><X className="w-3 h-3 text-slate-400" /></button>}
                        </div>
                    </div>
                </div>

                {/* Header Nav */}
                <div className="mt-3 mb-4 flex items-center justify-between text-sm text-blue-100 border-t border-white/10 pt-4">
                    <button 
                        type="button" 
                        onClick={() => setSelectedYear(y => Math.max(2024, y - 1))} 
                        disabled={selectedYear <= 2024}
                        className="flex items-center gap-1 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        <span>{language === 'vi' ? 'Trước' : 'Previous'}</span>
                    </button>

                    <div className="flex items-center gap-2 text-white">
                        <span className="text-base font-semibold">{selectedYear}</span>
                    </div>

                    <button 
                        type="button" 
                        onClick={() => setSelectedYear(y => Math.min(currentYear, y + 1))} 
                        disabled={selectedYear >= currentYear}
                        className="flex items-center gap-1 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span>{language === 'vi' ? 'Tiếp theo' : 'Next'}</span>
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Main Table */}
                <div className="rounded-2xl bg-white shadow-md overflow-hidden text-gray-900">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50/80 border-b border-gray-200">
                                    <th className="text-left px-5 py-3.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 w-1/4">{language === 'vi' ? 'Nhân viên' : 'Staff Member'}</th>
                                    <th className="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Tổng thâm niên' : 'Total Tenure'}</th>
                                    {activeTab === 'part_time' ? (
                                        <th className="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">{language === 'vi' ? `Số giờ trong năm ${selectedYear}` : `Hours in ${selectedYear}`}</th>
                                    ) : (
                                        <th className="text-left px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">{language === 'vi' ? `Thâm niên trong năm ${selectedYear}` : `Tenure in ${selectedYear}`}</th>
                                    )}
                                    <th className="text-right px-5 py-3.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 border-l border-gray-200/60 bg-white/50">{language === 'vi' ? 'Thưởng hiện tại' : 'Current Bonus'}</th>
                                    <th className="text-right px-5 py-3.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50/50 border-l border-blue-100">{language === 'vi' ? 'Dự kiến cuối năm' : 'Projected Year-End'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStaff.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center">
                                            <div className="flex flex-col items-center justify-center text-gray-400">
                                                <Users className="w-12 h-12 mb-3 opacity-20" />
                                                <p className="text-sm font-medium text-gray-500">{language === 'vi' ? `Không tìm thấy nhân viên ${activeTab === 'full_time' ? 'toàn thời gian' : 'bán thời gian'}.` : `No ${activeTab === 'full_time' ? 'full-time' : 'part-time'} staff found.`}</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredStaff.map((staff, idx) => {
                                        const totalTenureCurrent = calculateTenure(staff.start_date || new Date().toISOString(), evaluationEndDate);
                                        const effectiveStartDate = new Date(Math.max(new Date(staff.start_date || new Date()).getTime(), yearStart.getTime()));
                                        const tenureInYear = calculateTenure(effectiveStartDate.toISOString(), evaluationEndDate);
                                        const workedThisYear = effectiveStartDate <= evaluationEndDate;

                                        const avgRating = getStaffAverageRating(staff.id);
                                        const hasReviews = performanceReviews.some(r => r.staff_id === staff.id);

                                        let currentTotal = 0;
                                        let projectedTotal = 0;
                                        let detailsLine1: React.ReactNode = '';
                                        let detailsLine2: React.ReactNode = '';

                                        if (activeTab === 'full_time') {
                                            const calcFullTime = (endDate: Date, tenureYears: number, isProjected: boolean) => {
                                                const pureBase = calculateBaseBonus(staff, yearStart, endDate);
                                                
                                                const guaranteedPart = pureBase * (hrBonus13thGuaranteedPct / 100);
                                                const perfPart = pureBase * (hrBonus13thPerfPct / 100);
                                                
                                                let tierMult = 0;
                                                if (isProjected) {
                                                    tierMult = 1; // 100% of performance chunk for absolute maximum liability
                                                } else {
                                                    if (hasReviews) {
                                                        const matched = [...hrBonus13thPerfTiers].filter(t => avgRating >= t.min_rating).sort((a,b) => b.min_rating - a.min_rating);
                                                        if (matched.length > 0) tierMult = matched[0].multiplier_pct / 100;
                                                    } else {
                                                        tierMult = 1; // Default to 100% of performance chunk if no reviews exist for the year
                                                    }
                                                }
                                                
                                                const final13th = guaranteedPart + (perfPart * tierMult);
                                                
                                                const passes14thGate = isProjected || (!hasReviews || avgRating >= hrBonus14thMinRating);
                                                const mult14th = get14thMonthMultiplier(tenureYears, hrBonus14thBaseYears, hrBonus14thSteps);
                                                
                                                const raw14th = final13th * mult14th;
                                                const final14th = passes14thGate ? raw14th : 0;
                                                
                                                return { final13th, raw14th, final14th, total: final13th + final14th, passes14thGate };
                                            };

                                            const currentData = calcFullTime(evaluationEndDate, totalTenureCurrent.years, false);
                                            currentTotal = currentData.total;
                                            
                                            const totalTenureProjected = calculateTenure(staff.start_date || new Date().toISOString(), yearEnd);
                                            const projectedData = calcFullTime(yearEnd, totalTenureProjected.years, true);
                                            projectedTotal = projectedData.total;
                                            
                                            detailsLine1 = (
                                                <div className="flex flex-col items-end gap-1 mt-1.5">
                                                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                                            13th: {fmtCurrency(currentData.final13th)}
                                                        </span>
                                                        {currentData.raw14th > 0 && (
                                                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${!currentData.passes14thGate ? "bg-red-50 text-red-600 border-red-200" : "bg-indigo-50 text-indigo-600 border-indigo-200"}`}>
                                                                14th: {fmtCurrency(currentData.raw14th)} {!currentData.passes14thGate && <span title={language === 'vi' ? 'Không đạt chỉ tiêu' : 'Gatekeeper Missed'}>{language === 'vi' ? '⚠️ Chưa đạt' : '⚠️ Missed'}</span>}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                            
                                            detailsLine2 = (
                                                <div className="flex flex-col items-end gap-1 mt-1.5">
                                                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100/50 text-blue-700 border border-blue-200/50">
                                                            13th: {fmtCurrency(projectedData.final13th)}
                                                        </span>
                                                        {projectedData.raw14th > 0 && (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800 border border-blue-300">
                                                                14th: {fmtCurrency(projectedData.raw14th)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        } else {
                                            // Part time logic
                                            const hoursRaw = ptHours[staff.id];
                                            const hours = hoursRaw === undefined ? 0 : (parseFloat(hoursRaw) || 0);
                                            const pureBonus = calculatePartTimeBonus(hours, hrBonusPtMaxCap, hrBonusPtTargetHours, hrBonusPtMinHours);
                                            
                                            const passesGate = !hasReviews || avgRating >= hrBonusPtMinRating;
                                            currentTotal = passesGate ? pureBonus : 0;
                                            projectedTotal = selectedYear === currentYear ? hrBonusPtMaxCap : pureBonus; // Always assume max/passed for projected
                                            
                                            detailsLine1 = (
                                                <div className="flex flex-col items-end gap-1 mt-1.5">
                                                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                                            {language === 'vi' ? `${hours} giờ (giới hạn ở ${fmtCurrency(hrBonusPtMaxCap)})` : `${hours} hrs (capped at ${fmtCurrency(hrBonusPtMaxCap)})`}
                                                        </span>
                                                        {!passesGate && (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 border border-red-200">
                                                                {language === 'vi' ? '⚠️ Chưa đạt' : '⚠️ Missed'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                            detailsLine2 = (
                                                <div className="flex flex-col items-end gap-1 mt-1.5">
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100/50 text-blue-700 border border-blue-200/50">
                                                        {selectedYear === currentYear ? (language === 'vi' ? 'Giả định mức trần tối đa' : 'Max cap assumption') : (language === 'vi' ? `${hours} giờ` : `${hours} hrs`)}
                                                    </span>
                                                </div>
                                            );
                                        }

                                        return (
                                            <tr key={staff.id} className={`border-t border-gray-100 transition-colors hover:bg-gray-100 ${idx % 2 === 0 ? 'bg-gray-50/30' : ''}`}>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                                            {(staff.full_name || '').trim().split(/\s+/).filter(Boolean).map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium text-gray-900 block truncate">{staff.full_name}</span>
                                                                {hasReviews && (
                                                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200">
                                                                        {avgRating.toFixed(1)} <Star className="w-3 h-3 fill-current" />
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-gray-400 block">{staff.position || '—'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">{formatTenure(totalTenureCurrent, language)}</div>
                                                    <div className="text-xs text-gray-500">{language === 'vi' ? `${totalTenureCurrent.totalDays} ngày` : `${totalTenureCurrent.totalDays} days`}</div>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    {activeTab === 'part_time' ? (
                                                        <div className="flex items-center gap-2">
                                                            <input 
                                                                type="number" 
                                                                min="0" 
                                                                value={ptHours[staff.id] ?? ''}
                                                                onChange={(e) => setPtHours(prev => ({...prev, [staff.id]: e.target.value}))}
                                                                onBlur={(e) => handleUpdateHours(staff.id, e.target.value)}
                                                                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                                            />
                                                            <span className="text-xs text-gray-500">{language === 'vi' ? 'giờ' : 'hrs'}</span>
                                                        </div>
                                                    ) : (
                                                        workedThisYear ? (
                                                            <>
                                                                <div className="text-sm font-medium text-blue-700">{formatTenure(tenureInYear, language)}</div>
                                                                <div className="text-xs text-gray-500">{language === 'vi' ? `${tenureInYear.totalDays} ngày` : `${tenureInYear.totalDays} days`}</div>
                                                            </>
                                                        ) : (
                                                            <span className="text-sm text-gray-400 italic">{language === 'vi' ? 'Chưa vào làm' : 'Not employed'}</span>
                                                        )
                                                    )}
                                                </td>
                                                <td className="px-5 py-3 whitespace-nowrap text-right border-l border-gray-100">
                                                    {workedThisYear ? (
                                                        <>
                                                            <div className="text-[15px] font-black tracking-tight text-gray-900">{fmtCurrency(currentTotal)} <span className="text-[10px] font-normal font-mono text-gray-400 ml-0.5">VND</span></div>
                                                            {detailsLine1}
                                                        </>
                                                    ) : (
                                                        <span className="text-sm text-gray-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3 whitespace-nowrap text-right bg-blue-50/20 border-l border-blue-50">
                                                    {workedThisYear ? (
                                                        <>
                                                            <div className="text-[15px] font-black tracking-tight text-blue-700">{fmtCurrency(projectedTotal)} <span className="text-[10px] font-normal font-mono text-blue-400 ml-0.5">VND</span></div>
                                                            {detailsLine2}
                                                        </>
                                                    ) : (
                                                        <span className="text-sm text-gray-400">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {exportModalOpen && (
                <ExportModalYear onClose={() => setExportModalOpen(false)} onExport={handleExport} currentYear={currentYear} language={language} />
            )}
        </div>
    )
}
