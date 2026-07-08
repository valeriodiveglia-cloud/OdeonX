import { HiringRequest } from '@/types/human-resources'
import { useSettings } from '@/contexts/SettingsContext'
import { 
    Briefcase, 
    MapPin, 
    Users, 
    Clock, 
    DollarSign, 
    AlertCircle, 
    FileText, 
    CheckCircle2, 
    Folder 
} from 'lucide-react'

interface RequestOverviewProps {
    request: HiringRequest
    branchNames?: string
}

export function RequestOverview({ request, branchNames }: RequestOverviewProps) {
    const { language } = useSettings()
    const isVI = language === 'vi'

    // Formatter for currencies
    const formatValue = (val?: number | null) => {
        return val ? val.toLocaleString() : '0'
    }

    // Priority color mapping
    const getPriorityStyle = (priority?: string | null) => {
        switch (priority?.toLowerCase()) {
            case 'high':
                return 'bg-red-50 text-red-700 border-red-200/60'
            case 'medium':
                return 'bg-amber-50 text-amber-700 border-amber-200/60'
            case 'low':
            default:
                return 'bg-blue-50 text-blue-700 border-blue-200/60'
        }
    }

    // Status color mapping
    const getStatusStyle = (status?: string | null) => {
        switch (status?.toLowerCase()) {
            case 'draft':
                return 'bg-slate-100 text-slate-700 border-slate-200/60'
            case 'submitted':
                return 'bg-yellow-50 text-yellow-700 border-yellow-200/60'
            case 'in_progress':
                return 'bg-amber-50 text-amber-700 border-amber-200/60'
            case 'waiting_manager':
                return 'bg-orange-50 text-orange-700 border-orange-200/60'
            case 'on_hold':
                return 'bg-purple-50 text-purple-700 border-purple-200/60'
            case 'closed':
                return 'bg-green-50 text-green-700 border-green-200/60'
            case 'approved':
                return 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
            case 'rejected':
                return 'bg-rose-50 text-rose-700 border-rose-200/60'
            case 'pending':
                return 'bg-amber-50 text-amber-700 border-amber-200/60'
            default:
                return 'bg-slate-100 text-slate-700 border-slate-200/60'
        }
    }

    const statusLabels: Record<string, { en: string; vi: string }> = {
        draft: { en: 'Draft', vi: 'Nháp' },
        submitted: { en: 'Submitted', vi: 'Đã nộp' },
        in_progress: { en: 'In Progress', vi: 'Đang thực hiện' },
        waiting_manager: { en: 'Waiting Manager', vi: 'Chờ Quản lý' },
        on_hold: { en: 'On Hold', vi: 'Tạm dừng' },
        closed: { en: 'Closed', vi: 'Đã đóng' },
        approved: { en: 'Approved', vi: 'Đã phê duyệt' },
        rejected: { en: 'Rejected', vi: 'Đã từ chối' },
        pending: { en: 'Pending', vi: 'Đang chờ' }
    }

    // Employment type color mapping
    const getEmploymentTypeStyle = (type?: string | null) => {
        switch (type?.toLowerCase()) {
            case 'part_time':
                return 'bg-purple-50 text-purple-700 border-purple-200/60'
            case 'outsourced':
                return 'bg-orange-50 text-orange-700 border-orange-200/60'
            case 'full_time':
            default:
                return 'bg-blue-50 text-blue-700 border-blue-200/60'
        }
    }

    return (
        <div className="bg-white border border-gray-250/80 rounded-2xl shadow-sm p-8 md:p-10 text-gray-900">
            {/* Top Section: Metadata arranged in a very spacious grid (vertical gap is 10, horizontal is 12) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-12 pb-8 border-b border-gray-100">
                
                {/* Department */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        {isVI ? 'Bộ phận' : 'Department'}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <Folder className="w-4 h-4 text-slate-405" />
                        <span className="text-sm font-semibold text-slate-800">
                            {request.department}
                        </span>
                    </div>
                </div>

                {/* Employment Type */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        {isVI ? 'Loại hình làm việc' : 'Employment Type'}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${getEmploymentTypeStyle(request.employment_type)}`}>
                            {request.employment_type === 'part_time'
                                ? (isVI ? 'Bán thời gian' : 'Part-time')
                                : request.employment_type === 'outsourced'
                                ? (isVI ? 'Thuê ngoài' : 'Outsourced')
                                : (isVI ? 'Toàn thời gian' : 'Full-time')
                            }
                        </span>
                    </div>
                </div>

                {/* Headcount */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        {isVI ? 'Số lượng tuyển' : 'Headcount'}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <Users className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-bold text-slate-800">
                            {request.headcount} {isVI ? 'Nhân sự' : 'People'}
                        </span>
                    </div>
                </div>

                {/* Status */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        {isVI ? 'Trạng thái' : 'Status'}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <CheckCircle2 className="w-4 h-4 text-slate-400" />
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusStyle(request.status)}`}>
                            <span>
                                {statusLabels[request.status?.toLowerCase()]
                                    ? (isVI ? statusLabels[request.status.toLowerCase()].vi : statusLabels[request.status.toLowerCase()].en)
                                    : request.status
                                }
                            </span>
                        </span>
                    </div>
                </div>

                {/* Estimated Salary */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        {isVI ? 'Mức lương' : 'Salary'}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <DollarSign className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-bold text-slate-850">
                            {request.salary_min
                                ? `${formatValue(request.salary_min)} - ${formatValue(request.salary_max)}`
                                : formatValue(request.salary_max)
                            } {request.currency}
                            <span className="text-xs text-slate-400 font-semibold ml-1">
                                {request.employment_type === 'part_time'
                                    ? (isVI ? '/ giờ' : '/ hr')
                                    : (isVI ? '/ tháng' : '/ mo')
                                }
                            </span>
                        </span>
                    </div>
                </div>

                {/* Priority */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        {isVI ? 'Độ ưu tiên' : 'Priority'}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <AlertCircle className="w-4 h-4 text-slate-400" />
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getPriorityStyle(request.priority)}`}>
                            <span className="capitalize">{request.priority}</span>
                        </span>
                    </div>
                </div>

                {/* Created By */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        {isVI ? 'Người tạo' : 'Created By'}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <Users className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-semibold text-slate-800">
                            {request.creator?.name || (isVI ? 'Không xác định' : 'Unknown')}
                        </span>
                    </div>
                </div>

                {/* Target Branches */}
                <div className="flex flex-col gap-1.5 md:col-span-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        {isVI ? 'Chi nhánh áp dụng' : 'Target Branches'}
                    </span>
                    <div className="flex items-start gap-1.5 mt-0.5">
                        <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div className="flex flex-wrap gap-1">
                            {branchNames ? branchNames.split(', ').map((branch, idx) => (
                                <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 text-xs font-semibold">
                                    {branch}
                                </span>
                            )) : (
                                <span className="text-xs text-slate-400 italic">
                                    {isVI ? 'Chưa cấu hình chi nhánh' : 'No branches configured'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Section: Job Description Details */}
            <div className="pt-8">
                <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-4 h-4 text-blue-650" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {isVI ? 'Chi tiết mô tả công việc' : 'Job Description Details'}
                    </span>
                </div>
                <div 
                    className="text-sm text-slate-650 leading-relaxed whitespace-pre-wrap prose max-w-none [&_ul]:list-disc [&_ul]:pl-5 [&_li]:list-item [&_p]:mb-3 [&_strong]:font-semibold"
                    dangerouslySetInnerHTML={{ __html: request.description || '' }}
                />
            </div>

            {/* Additional Notes (if present) */}
            {request.notes && (
                <div className="pt-8 border-t border-gray-100 mt-8">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            {isVI ? 'Ghi chú bổ sung' : 'Additional Notes'}
                        </span>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                        {request.notes}
                    </p>
                </div>
            )}
        </div>
    )
}
