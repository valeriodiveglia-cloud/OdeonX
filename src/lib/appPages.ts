import { 
  CalculatorIcon, 
  BuildingOffice2Icon, 
  DocumentTextIcon, 
  Cog6ToothIcon, 
  UserGroupIcon, 
  MapPinIcon,
  CreditCardIcon,
  TicketIcon,
  BriefcaseIcon,
  DocumentChartBarIcon,
} from '@heroicons/react/24/outline'

import { 
  LayoutDashboard, 
  Boxes, 
  Handshake, 
  Target,
  BarChart3,
  ChefHat,
  Utensils,
  LineChart,
  Building2,
  CalendarDays,
  FileSpreadsheet,
  Users,
  Target as FocusIcon,
  ShieldAlert,
  Percent,
  Banknote,
  Wrench,
  Truck,
  FileText,
  Settings,
  Home,
  HandCoins,
  CalendarCheck2,
  Receipt,
  ArrowLeftRight,
  Trash2,
  Wallet,
  Landmark,
  Activity,
  Star,
  TrendingUp,
  CreditCard,
  Ticket,
  BookOpen,
  ScrollText,
  Briefcase
} from 'lucide-react'

export type AppPage = {
  id: string
  href: string
  title: string
  module: string
  icon: any
  requiresRole?: string[]
}

export const APP_PAGES_DIRECTORY: AppPage[] = [
  // Dashboard default
  { id: 'dashboard', href: '/dashboard', title: 'Dashboard', module: 'System', icon: LayoutDashboard },
  { id: 'general-settings', href: '/general-settings', title: 'Global Settings', module: 'System', icon: Cog6ToothIcon },
  
  // Costing & Materials
  { id: 'materials', href: '/materials', title: 'Materials', module: 'Costing & Operations', icon: Boxes },
  { id: 'materials-history', href: '/materials-history', title: 'Materials History', module: 'Costing & Operations', icon: BarChart3 },
  { id: 'recipes', href: '/recipes', title: 'Recipes', module: 'Costing & Operations', icon: ChefHat },
  { id: 'equipment', href: '/equipment', title: 'Equipment', module: 'Costing & Operations', icon: Utensils },
  { id: 'equipment-history', href: '/equipment-history', title: 'Equipment History', module: 'Costing & Operations', icon: LineChart },
  { id: 'suppliers', href: '/suppliers', title: 'Suppliers', module: 'Costing & Operations', icon: Building2 },
  { id: 'costing-settings', href: '/settings', title: 'Costing Settings', module: 'Costing & Operations', icon: Settings },
  
  // Catering
  { id: 'catering', href: '/catering', title: 'Event Calculator', module: 'Catering', icon: Building2 },
  { id: 'catering-settings', href: '/catering/eventsettings', title: 'Event Settings', module: 'Catering', icon: Settings },
  
  // Daily Reports
  { id: 'daily-reports-closing', href: '/daily-reports/closinglist', title: 'Cashier Closing', module: 'Daily Reports', icon: Banknote },
  { id: 'daily-reports-cashout', href: '/daily-reports/cashout', title: 'Cash Out', module: 'Daily Reports', icon: Receipt },
  { id: 'daily-reports-bank', href: '/daily-reports/banktransfers', title: 'Bank Transfers', module: 'Daily Reports', icon: ArrowLeftRight },
  { id: 'daily-reports-wastage', href: '/daily-reports/wastage-report', title: 'Wastage Report', module: 'Daily Reports', icon: Trash2 },
  { id: 'daily-reports-credits', href: '/daily-reports/credits', title: 'Credits', module: 'Daily Reports', icon: Wallet },
  { id: 'daily-reports-deposits', href: '/daily-reports/deposits', title: 'Deposits', module: 'Daily Reports', icon: Landmark },
  { id: 'daily-reports-settings', href: '/daily-reports/dailyreportsettings', title: 'Daily Reports Settings', module: 'Daily Reports', icon: Settings },
  
  // Asset Inventory
  { id: 'asset-inventory-dash', href: '/asset-inventory', title: 'Asset Dashboard', module: 'Asset Inventory', icon: LayoutDashboard },
  { id: 'asset-inventory-list', href: '/asset-inventory/list', title: 'Assets List', module: 'Asset Inventory', icon: Boxes },
  { id: 'asset-inventory-reports', href: '/asset-inventory/reports', title: 'Asset Reports', module: 'Asset Inventory', icon: FileText },
  { id: 'asset-inventory-settings', href: '/asset-inventory/settings', title: 'Asset Settings', module: 'Asset Inventory', icon: Settings },

  // Loyalty Manager
  { id: 'loyalty-manager', href: '/loyalty-manager', title: 'Loyalty Dashboard', module: 'Loyalty', icon: LayoutDashboard },
  { id: 'loyalty-cards', href: '/loyalty-manager/cards', title: 'Loyalty Cards', module: 'Loyalty', icon: CreditCard },
  { id: 'loyalty-vouchers', href: '/loyalty-manager/vouchers', title: 'Vouchers', module: 'Loyalty', icon: Ticket },
  { id: 'loyalty-settings', href: '/loyalty-manager/settings', title: 'Loyalty Settings', module: 'Loyalty', icon: Settings },

  // HR Module - Global
  { id: 'hr-dashboard', href: '/human-resources', title: 'HR Dashboard', module: 'HR General', icon: Home },
  { id: 'hr-recruitment', href: '/human-resources/recruitment', title: 'Recruitment', module: 'HR General', icon: Briefcase },
  { id: 'hr-activity', href: '/human-resources/activity', title: 'Activity', module: 'HR General', icon: Activity },
  { id: 'hr-candidates', href: '/human-resources/candidates', title: 'Candidates', module: 'HR General', icon: Users },
  
  // HR Management
  { id: 'hrm-staff', href: '/human-resources/management/staff', title: 'Staff List', module: 'HR Management', icon: Users },
  { id: 'hrm-performance', href: '/human-resources/management/performance', title: 'Performance Reviews', module: 'HR Management', icon: Star },
  { id: 'hrm-salary', href: '/human-resources/management/salary-history', title: 'Salary History', module: 'HR Management', icon: TrendingUp },
  { id: 'hrm-settings', href: '/human-resources/management/settings', title: 'Management Settings', module: 'HR Management', icon: Settings },
  
  // HR Operational
  { id: 'hro-roster', href: '/human-resources/operational/roster', title: 'Roster', module: 'HR Operational', icon: CalendarDays },
  { id: 'hro-reports', href: '/human-resources/operational/reports', title: 'HR Reports', module: 'HR Operational', icon: BarChart3 },
  { id: 'hro-settings', href: '/human-resources/operational/settings', title: 'Operational Settings', module: 'HR Operational', icon: Settings },
  
  // CRM
  { id: 'crm-dash', href: '/crm', title: 'CRM Dashboard', module: 'CRM', icon: Home, requiresRole: ['owner', 'admin', 'manager'] },
  { id: 'crm-partners', href: '/crm/partners', title: 'Partners & Pipeline', module: 'CRM', icon: Users, requiresRole: ['owner', 'admin', 'manager'] },
  { id: 'crm-referrals', href: '/crm/referrals', title: 'Referrals', module: 'CRM', icon: Target },
  { id: 'crm-commissions', href: '/crm/commissions', title: 'Commissions', module: 'CRM', icon: HandCoins, requiresRole: ['owner', 'admin', 'manager'] },
  { id: 'crm-tasks', href: '/crm/tasks', title: 'Tasks', module: 'CRM', icon: CalendarCheck2, requiresRole: ['owner', 'admin', 'manager'] },
  
  // Monthly Reports
  { id: 'monthly-dash', href: '/monthly-reports', title: 'Monthly Dashboard', module: 'Monthly Reports', icon: LayoutDashboard, requiresRole: ['owner', 'admin'] },
  { id: 'monthly-closing', href: '/monthly-reports/closinglist', title: 'Closing List', module: 'Monthly Reports', icon: Banknote, requiresRole: ['owner', 'admin'] },
  { id: 'monthly-cashout', href: '/monthly-reports/cashout', title: 'Cash Out', module: 'Monthly Reports', icon: Receipt, requiresRole: ['owner', 'admin'] },
  { id: 'monthly-bank', href: '/monthly-reports/banktransfers', title: 'Bank Transfers', module: 'Monthly Reports', icon: ArrowLeftRight, requiresRole: ['owner', 'admin'] },
  { id: 'monthly-wastage', href: '/monthly-reports/wastage-report', title: 'Wastage', module: 'Monthly Reports', icon: Trash2, requiresRole: ['owner', 'admin'] },
  { id: 'monthly-credits', href: '/monthly-reports/credits', title: 'Credits', module: 'Monthly Reports', icon: Wallet, requiresRole: ['owner', 'admin'] },
  { id: 'monthly-deposits', href: '/monthly-reports/deposits', title: 'Deposits', module: 'Monthly Reports', icon: Landmark, requiresRole: ['owner', 'admin'] },
  { id: 'monthly-ledger', href: '/monthly-reports/cash-ledger', title: 'Cash Ledger', module: 'Monthly Reports', icon: BookOpen, requiresRole: ['owner', 'admin'] },
  { id: 'monthly-activity', href: '/monthly-reports/activity-log', title: 'Activity Log', module: 'Monthly Reports', icon: ScrollText, requiresRole: ['owner', 'admin'] },
]

export const getDefaultQuickAccess = (role: string | null) => {
  const allowed = APP_PAGES_DIRECTORY.filter(p => !p.requiresRole || p.requiresRole.includes(role || 'staff'))
  
  // Pick some reasonable defaults
  const defaults = ['general-settings', 'crm-partners', 'crm-referrals'].filter(id => 
    allowed.some(a => a.id === id)
  )
  
  // If defaults aren't accessible, fallback to whatever is allowed up to 4 items
  if (defaults.length === 0) {
    return allowed.slice(0, 4).map(p => p.id)
  }
  
  return defaults
}

export const getPageByHref = (href: string) => {
  // Try exact match
  let page = APP_PAGES_DIRECTORY.find(p => p.href === href || p.href === href.replace(/\/$/, ''))
  if (page) return page
  
  // Try partial match for subroutes, sorting by deepest route first
  const sorted = [...APP_PAGES_DIRECTORY].sort((a, b) => b.href.length - a.href.length)
  return sorted.find(p => href.startsWith(p.href))
}
