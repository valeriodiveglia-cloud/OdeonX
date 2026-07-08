'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffMember, HRStaffContract } from '@/types/human-resources'
import { Search, X, Loader2, Users, Star, ChevronLeft, ChevronRight, CalendarDays, FileDown, Clock, MoreVertical, ArrowUp, ArrowDown, Filter } from 'lucide-react'
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

    // Column Header state
    type SortKey = 'name' | 'totalTenure' | 'yearlyTenure' | 'currentBonus' | 'projectedBonus';
    const [sortKey, setSortKey] = useState<SortKey>('name')
    const [sortAsc, setSortAsc] = useState(true)
    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({})
    const [openMenu, setOpenMenu] = useState<SortKey | null>(null)

    function applySort(k: SortKey, asc: boolean) {
        setSortKey(k); setSortAsc(asc); setOpenMenu(null)
    }
    function applyColumnFilter(col: SortKey, vals: Set<string> | null) {
        setColumnFilters(prev => ({ ...prev, [col]: vals })); setOpenMenu(null)
    }
    function clearColumnFilter(col: SortKey) {
        setColumnFilters(prev => { const n = { ...prev }; delete n[col]; return n }); setOpenMenu(null)
    }

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

    const today = new Date();
    const yearEnd = new Date(selectedYear, 11, 31);
    const yearStart = new Date(selectedYear, 0, 1);
    const evaluationEndDate = selectedYear === currentYear ? today : yearEnd;
    const availableYears = Array.from({ length: Math.max(2, currentYear - 2024 + 2) }, (_, i) => 2024 + i);

    const processedStaffList = useMemo(() => {
        return staffList.map(staff => {
            const avgRating = getStaffAverageRating(staff.id);
            const hasReviews = performanceReviews.some(r => r.staff_id === staff.id);
            
            const totalTenureCurrent = calculateTenure(staff.start_date || new Date().toISOString(), evaluationEndDate);
            const effectiveStartDate = new Date(Math.max(new Date(staff.start_date || new Date()).getTime(), yearStart.getTime()));
            const tenureInYear = calculateTenure(effectiveStartDate.toISOString(), evaluationEndDate);
            const workedThisYear = effectiveStartDate <= evaluationEndDate;

            let currentTotal = 0;
            let projectedTotal = 0;
            let yearlyTenureVal = 0;
            let yearlyTenureStr = '';

            let currentData = null;
            let projectedData = null;

            if (staff.employment_type === 'full_time') {
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
                    return { final13th, raw14th, final14th, total: final13th + final14th, passes14thGate };
                };

                const curr = calcFullTime(evaluationEndDate, totalTenureCurrent.years, false);
                currentTotal = curr.total;
                currentData = curr;

                const totalTenureProjected = calculateTenure(staff.start_date || new Date().toISOString(), yearEnd);
                const proj = calcFullTime(yearEnd, totalTenureProjected.years, true);
                projectedTotal = proj.total;
                projectedData = proj;

                yearlyTenureVal = workedThisYear ? tenureInYear.totalDays : 0;
                yearlyTenureStr = workedThisYear ? formatTenure(tenureInYear, language) : (language === 'vi' ? 'Chưa vào làm' : 'Not employed');
            } else {
                const hoursRaw = ptHours[staff.id];
                const hours = hoursRaw === undefined ? 0 : (parseFloat(hoursRaw) || 0);
                const pureBonus = calculatePartTimeBonus(hours, hrBonusPtMaxCap, hrBonusPtTargetHours, hrBonusPtMinHours);
                const passesGate = !hasReviews || avgRating >= hrBonusPtMinRating;
                
                currentTotal = passesGate ? pureBonus : 0;
                projectedTotal = selectedYear === currentYear ? hrBonusPtMaxCap : pureBonus;

                yearlyTenureVal = hours;
                yearlyTenureStr = `${hours} ${language === 'vi' ? 'giờ' : 'hrs'}`;
            }

            return {
                staff,
                id: staff.id,
                name: staff.full_name || '',
                avgRating,
                hasReviews,
                totalTenureCurrent,
                totalTenureCurrentStr: formatTenure(totalTenureCurrent, language),
                tenureInYear,
                workedThisYear,
                yearlyTenureVal,
                yearlyTenureStr,
                currentTotal,
                projectedTotal,
                currentData,
                projectedData
            };
        });
    }, [staffList, ptHours, performanceReviews, hrBonus13thGuaranteedPct, hrBonus13thPerfPct, hrBonus13thPerfTiers, hrBonus14thMinRating, hrBonus14thBaseYears, hrBonus14thSteps, hrBonusPtMaxCap, hrBonusPtTargetHours, hrBonusPtMinHours, hrBonusPtMinRating, selectedYear, currentYear, language, getStaffAverageRating]);

    const totals = useMemo(() => {
        let ftCurrent = 0;
        let ftProjected = 0;
        let ptCurrent = 0;
        let ptProjected = 0;

        processedStaffList.forEach(item => {
            if (!item.workedThisYear) return;
            if (item.staff.employment_type === 'full_time') {
                ftCurrent += item.currentTotal;
                ftProjected += item.projectedTotal;
            } else {
                ptCurrent += item.currentTotal;
                ptProjected += item.projectedTotal;
            }
        });

        return {
            ftCurrent, ftProjected,
            ptCurrent, ptProjected,
            grandCurrent: ftCurrent + ptCurrent,
            grandProjected: ftProjected + ptProjected
        };
    }, [processedStaffList]);

    const columnValues = useMemo(() => {
        const map: Record<string, string[]> = {}
        const keys: SortKey[] = ['name', 'totalTenure', 'yearlyTenure', 'currentBonus', 'projectedBonus']
        const listForTab = processedStaffList.filter(item => item.staff.employment_type === activeTab)

        keys.forEach(k => {
            const set = new Set<string>()
            listForTab.forEach(item => {
                let val = ''
                switch (k) {
                    case 'name': val = item.name; break;
                    case 'totalTenure': val = item.totalTenureCurrentStr; break;
                    case 'yearlyTenure': val = item.yearlyTenureStr; break;
                    case 'currentBonus': val = fmtCurrency(item.currentTotal); break;
                    case 'projectedBonus': val = fmtCurrency(item.projectedTotal); break;
                }
                if (val) set.add(val)
            })
            map[k] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        })
        return map
    }, [processedStaffList, activeTab, language])

    const filteredStaff = useMemo(() => {
        let out = processedStaffList.filter(item => item.staff.employment_type === activeTab);

        if (search) {
            const q = search.toLowerCase();
            out = out.filter(item => 
                item.name.toLowerCase().includes(q) || 
                (item.staff.position || '').toLowerCase().includes(q)
            );
        }

        for (const [col, allowed] of Object.entries(columnFilters)) {
            if (!allowed) continue;
            out = out.filter(item => {
                let val = '';
                switch (col) {
                    case 'name': val = item.name; break;
                    case 'totalTenure': val = item.totalTenureCurrentStr; break;
                    case 'yearlyTenure': val = item.yearlyTenureStr; break;
                    case 'currentBonus': val = fmtCurrency(item.currentTotal); break;
                    case 'projectedBonus': val = fmtCurrency(item.projectedTotal); break;
                }
                return allowed.has(val);
            });
        }

        out.sort((a, b) => {
            let av: any, bv: any;
            switch (sortKey) {
                case 'name': av = a.name; bv = b.name; break;
                case 'totalTenure': av = a.totalTenureCurrent.totalDays; bv = b.totalTenureCurrent.totalDays; break;
                case 'yearlyTenure': av = a.yearlyTenureVal; bv = b.yearlyTenureVal; break;
                case 'currentBonus': av = a.currentTotal; bv = b.currentTotal; break;
                case 'projectedBonus': av = a.projectedTotal; bv = b.projectedTotal; break;
                default: av = ''; bv = '';
            }
            let cmp = 0;
            if (typeof av === 'number' && typeof bv === 'number') {
                cmp = av - bv;
            } else {
                cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
            }
            return sortAsc ? cmp : -cmp;
        });

        return out;
    }, [processedStaffList, activeTab, search, columnFilters, sortKey, sortAsc]);

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

    const dict = language === 'vi' ? {
        sortAsc: 'Sắp xếp tăng dần',
        sortDesc: 'Sắp xếp giảm dần',
        selectAll: 'Chọn tất cả',
        deselectAll: 'Bỏ chọn tất cả',
        filterPlaceholder: 'Lọc...',
        clearFilters: 'Xóa bộ lọc'
    } : {
        sortAsc: 'Sort Ascending',
        sortDesc: 'Sort Descending',
        selectAll: 'Select All',
        deselectAll: 'Deselect All',
        filterPlaceholder: 'Filter...',
        clearFilters: 'Clear Filters'
    };

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
                    <div className="bg-white border border-gray-200/60 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                        <div className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                                <Users className="w-4 h-4" />
                            </div>
                            {language === 'vi' ? 'Thưởng toàn thời gian' : 'Full-Time Bonus'}
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-gray-900">{fmtCurrency(totals.ftCurrent)} <span className="text-xs font-normal text-gray-400">VND</span></div>
                            <div className="text-xs text-gray-500 mt-2 flex items-center justify-between border-t border-gray-50 pt-2">
                                <span>{language === 'vi' ? 'Tối đa dự kiến:' : 'Projected max:'}</span>
                                <span className="font-semibold text-blue-600">{fmtCurrency(totals.ftProjected)} VND</span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white border border-gray-200/60 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                        <div className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                                <Clock className="w-4 h-4" />
                            </div>
                            {language === 'vi' ? 'Thưởng bán thời gian' : 'Part-Time Bonus'}
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-gray-900">{fmtCurrency(totals.ptCurrent)} <span className="text-xs font-normal text-gray-400">VND</span></div>
                            <div className="text-xs text-gray-500 mt-2 flex items-center justify-between border-t border-gray-50 pt-2">
                                <span>{language === 'vi' ? 'Tối đa dự kiến:' : 'Projected max:'}</span>
                                <span className="font-semibold text-emerald-600">{fmtCurrency(totals.ptProjected)} VND</span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white border border-gray-200/60 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                        <div className="text-sm font-medium text-indigo-600 mb-2 flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                                <Star className="w-4 h-4 fill-current" />
                            </div>
                            {language === 'vi' ? 'Tổng nghĩa vụ chi trả' : 'Grand Total Liability'}
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-gray-900">{fmtCurrency(totals.grandCurrent)} <span className="text-xs font-normal text-gray-400">VND</span></div>
                            <div className="text-xs text-gray-500 mt-2 flex items-center justify-between border-t border-gray-50 pt-2">
                                <span>{language === 'vi' ? 'Tối đa tuyệt đối dự kiến:' : 'Projected absolute max:'}</span>
                                <span className="font-semibold text-indigo-600">{fmtCurrency(totals.grandProjected)} VND</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters & Tabs */}
                <div className="border-b border-white/10 mt-12 mb-3">
                    <div className="flex gap-6 -mb-px">
                        <button 
                            onClick={() => setActiveTab('full_time')}
                            className={`pb-3 text-sm font-semibold border-b-2 transition-all ${activeTab === 'full_time' ? 'border-blue-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                        >
                            {language === 'vi' ? 'Toàn thời gian' : 'Full-Time'}
                        </button>
                        <button 
                            onClick={() => setActiveTab('part_time')}
                            className={`pb-3 text-sm font-semibold border-b-2 transition-all ${activeTab === 'part_time' ? 'border-blue-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                        >
                            {language === 'vi' ? 'Bán thời gian' : 'Part-Time'}
                        </button>
                    </div>
                </div>

                {/* Header Nav */}
                <div className="mt-2 mb-3 flex items-center justify-between text-sm text-blue-100 pt-1">
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
                        <div className="relative w-5 h-5 group">
                            <CalendarDays className="w-5 h-5 text-blue-200 group-hover:text-blue-100 transition-colors cursor-pointer" />
                            <select 
                                value={selectedYear} 
                                onChange={e => setSelectedYear(parseInt(e.target.value) || currentYear)}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            >
                                {availableYears.map(y => (
                                    <option key={y} value={y} className="text-gray-900">{y}</option>
                                ))}
                            </select>
                        </div>
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
                                    <ColumnHeader
                                        colKey="name"
                                        label={language === 'vi' ? 'Nhân viên' : 'Staff Member'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['name'] || []}
                                        activeFilter={columnFilters['name'] || null}
                                        onFilter={(s) => applyColumnFilter('name', s)}
                                        onClear={() => clearColumnFilter('name')}
                                        open={openMenu === 'name'}
                                        onToggle={() => setOpenMenu(openMenu === 'name' ? null : 'name')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                        className="w-1/4 min-w-[200px]"
                                    />
                                    <ColumnHeader
                                        colKey="totalTenure"
                                        label={language === 'vi' ? 'Tổng thâm niên' : 'Total Tenure'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['totalTenure'] || []}
                                        activeFilter={columnFilters['totalTenure'] || null}
                                        onFilter={(s) => applyColumnFilter('totalTenure', s)}
                                        onClear={() => clearColumnFilter('totalTenure')}
                                        open={openMenu === 'totalTenure'}
                                        onToggle={() => setOpenMenu(openMenu === 'totalTenure' ? null : 'totalTenure')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                    />
                                    <ColumnHeader
                                        colKey="yearlyTenure"
                                        label={activeTab === 'part_time'
                                            ? (language === 'vi' ? `Số giờ in ${selectedYear}` : `Hours in ${selectedYear}`)
                                            : (language === 'vi' ? `Thâm niên in ${selectedYear}` : `Tenure in ${selectedYear}`)
                                        }
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['yearlyTenure'] || []}
                                        activeFilter={columnFilters['yearlyTenure'] || null}
                                        onFilter={(s) => applyColumnFilter('yearlyTenure', s)}
                                        onClear={() => clearColumnFilter('yearlyTenure')}
                                        open={openMenu === 'yearlyTenure'}
                                        onToggle={() => setOpenMenu(openMenu === 'yearlyTenure' ? null : 'yearlyTenure')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                    />
                                    <ColumnHeader
                                        colKey="currentBonus"
                                        label={language === 'vi' ? 'Thưởng hiện tại' : 'Current Bonus'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['currentBonus'] || []}
                                        activeFilter={columnFilters['currentBonus'] || null}
                                        onFilter={(s) => applyColumnFilter('currentBonus', s)}
                                        onClear={() => clearColumnFilter('currentBonus')}
                                        open={openMenu === 'currentBonus'}
                                        onToggle={() => setOpenMenu(openMenu === 'currentBonus' ? null : 'currentBonus')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                        right
                                        className="border-l border-gray-200/60 bg-white/50"
                                    />
                                    <ColumnHeader
                                        colKey="projectedBonus"
                                        label={language === 'vi' ? 'Dự kiến cuối năm' : 'Projected Year-End'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['projectedBonus'] || []}
                                        activeFilter={columnFilters['projectedBonus'] || null}
                                        onFilter={(s) => applyColumnFilter('projectedBonus', s)}
                                        onClear={() => clearColumnFilter('projectedBonus')}
                                        open={openMenu === 'projectedBonus'}
                                        onToggle={() => setOpenMenu(openMenu === 'projectedBonus' ? null : 'projectedBonus')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                        right
                                        className="text-blue-600 bg-blue-50/50 border-l border-blue-100"
                                    />
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
                                    filteredStaff.map((item, idx) => {
                                        const {
                                            staff,
                                            id,
                                            name,
                                            avgRating,
                                            hasReviews,
                                            totalTenureCurrent,
                                            totalTenureCurrentStr,
                                            tenureInYear,
                                            workedThisYear,
                                            yearlyTenureVal,
                                            yearlyTenureStr,
                                            currentTotal,
                                            projectedTotal,
                                            currentData,
                                            projectedData
                                        } = item;

                                        let detailsLine1: React.ReactNode = '';
                                        let detailsLine2: React.ReactNode = '';

                                        if (activeTab === 'full_time' && currentData && projectedData) {
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
                                        } else if (activeTab === 'part_time') {
                                            const hours = yearlyTenureVal;
                                            const passesGate = !hasReviews || avgRating >= hrBonusPtMinRating;
                                            detailsLine1 = (
                                                <div className="flex flex-col items-end gap-1 mt-1.5">
                                                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                                            {language === 'vi' ? `${hours} giờ (giới hạn ở ${fmtCurrency(hrBonusPtMaxCap)})` : `${hours} hrs (capped at ${fmtCurrency(hrBonusPtMaxCap)})`}
                                                        </span>
                                                        {!passesGate && (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 border-red-200">
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
                                                    <div className="text-sm font-medium text-gray-900">{totalTenureCurrentStr}</div>
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
                                        );
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

/* --- Column Header Component --- */
type ColumnHeaderProps = {
    colKey: string
    label: string
    sortKey: string
    sortAsc: boolean
    onSort: (k: any, asc: boolean) => void
    values: string[]
    activeFilter: Set<string> | null
    onFilter: (s: Set<string> | null) => void
    onClear: () => void
    open: boolean
    onToggle: () => void
    onClose: () => void
    dict: { sortAsc: string; sortDesc: string; selectAll: string; deselectAll: string; filterPlaceholder: string; clearFilters: string }
    right?: boolean
    center?: boolean
    className?: string
}

function ColumnHeader({ colKey, label, sortKey, sortAsc, onSort, values, activeFilter, onFilter, onClear, open, onToggle, onClose, dict, right, center, className = '' }: ColumnHeaderProps) {
    const ref = useRef<HTMLDivElement>(null)
    const [filterSearch, setFilterSearch] = useState('')
    const [localChecked, setLocalChecked] = useState<Set<string>>(new Set(values))

    useEffect(() => {
        if (open) {
            setLocalChecked(activeFilter ? new Set(activeFilter) : new Set(values))
            setFilterSearch('')
        }
    }, [open, values, activeFilter])

    useEffect(() => {
        if (!open) return
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose()
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [open, onClose])

    const isActive = sortKey === colKey
    const hasFilter = !!activeFilter
    const dropdownStyle = useMemo(() => {
        if (!open || !ref.current) return undefined
        const rect = ref.current.getBoundingClientRect()
        return { top: rect.bottom + 4, left: right ? Math.max(0, rect.right - 220) : rect.left }
    }, [open, right])

    const filteredValues = filterSearch
        ? values.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
        : values

    const allVisibleChecked = filteredValues.length > 0 && filteredValues.every(v => localChecked.has(v))

    function toggleAll() {
        const next = new Set(localChecked)
        if (allVisibleChecked) { filteredValues.forEach(v => next.delete(v)) }
        else { filteredValues.forEach(v => next.add(v)) }
        setLocalChecked(next)
    }

    function toggleOne(v: string) {
        const next = new Set(localChecked)
        if (next.has(v)) next.delete(v); else next.add(v)
        setLocalChecked(next)
    }

    function handleApply() {
        let finalChecked = localChecked;
        if (filterSearch) {
            finalChecked = new Set([...localChecked].filter(x => filteredValues.includes(x)));
        }
        if (finalChecked.size >= values.length) onFilter(null); 
        else onFilter(finalChecked);
    }

    return (
        <th className={`px-4 py-3.5 ${right ? 'text-right' : ''} ${className} relative`} ref={ref as any}>
            <div className={`flex items-center gap-1 font-bold uppercase tracking-wider text-gray-500 text-[10px] ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
                <span className="select-none">{label}</span>
                {isActive && (
                    sortAsc
                        ? <ArrowUp className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        : <ArrowDown className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                )}
                {hasFilter && <Filter className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggle() }}
                    className="ml-0.5 p-0.5 rounded hover:bg-gray-200 transition-colors flex-shrink-0 cursor-pointer"
                    aria-label={`Menu ${label}`}
                >
                    <MoreVertical className="w-4 h-4 text-gray-500" />
                </button>
            </div>

            {open && dropdownStyle && (
                <div
                    className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700 normal-case font-normal"
                    style={dropdownStyle}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="px-3 py-2 space-y-1">
                        <button
                            type="button"
                            onClick={() => onSort(colKey, true)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}
                        >
                            <ArrowUp className="w-4 h-4" />
                            {dict.sortAsc}
                        </button>
                        <button
                            type="button"
                            onClick={() => onSort(colKey, false)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && !sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}
                        >
                            <ArrowDown className="w-4 h-4" />
                            {dict.sortDesc}
                        </button>
                    </div>

                    <div className="border-t border-gray-200" />

                    <div className="px-3 py-2">
                        <input
                            type="text"
                            value={filterSearch}
                            onChange={e => setFilterSearch(e.target.value)}
                            placeholder={dict.filterPlaceholder}
                            className="w-full mb-2 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-gray-900"
                        />
                        <button
                            type="button"
                            onClick={toggleAll}
                            className="text-xs text-blue-600 hover:text-blue-800 mb-1 cursor-pointer font-medium"
                        >
                            {allVisibleChecked ? dict.deselectAll : dict.selectAll}
                        </button>
                        <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                            {filteredValues.map(v => (
                                <label key={v} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={localChecked.has(v)}
                                        onChange={() => toggleOne(v)}
                                        className="accent-blue-600 rounded"
                                    />
                                    <span className="truncate text-xs">{v || '(Empty)'}</span>
                                </label>
                            ))}
                            {filteredValues.length === 0 && (
                                <div className="text-xs text-gray-400 py-1 text-center">—</div>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
                        <button type="button" onClick={onClear} className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer font-medium">
                            {dict.clearFilters}
                        </button>
                        <button type="button" onClick={handleApply} className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer font-medium">
                            OK
                        </button>
                    </div>
                </div>
            )}
        </th>
    )
}
