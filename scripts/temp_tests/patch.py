import re

with open("src/app/dashboard/page.tsx", "r") as f:
    content = f.read()

# Replace Topbar
# We'll just replace the Topbar function block.
topbar_pattern = re.compile(r"function Topbar.*?\n}", re.DOTALL)
new_topbar = """function Topbar({ userEmail, onLogout }: { userEmail: string; onLogout: () => void }) {
  const { language, setLanguage } = useSettings()
  const isEN = language === 'en'
  const countryCode = isEN ? 'GB' : 'VN'
  const nextLang = isEN ? 'vi' : 'en'
  const label = isEN ? t(language, 'SwitchToVi') : t(language, 'SwitchToEn')

  return (
    <header className="bg-white/80 backdrop-blur-md shadow-[0_4px_30px_rgb(0,0,0,0.05)] border-b border-gray-100/50 sticky top-0 z-50 rounded-b-3xl mx-2">
      <div className="h-16 max-w-[1500px] mx-auto px-6 flex items-center justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative h-12 w-40">
            <img src="/logo.svg" alt="OddsOff Logo" className="h-full w-full object-contain object-left" />
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3 md:gap-4">
          <button
            type="button"
            onClick={() => setLanguage(nextLang as 'en' | 'vi')}
            aria-label={label}
            className="w-8 h-8 flex items-center justify-center rounded-full overflow-hidden border border-black/10 hover:bg-black/5 bg-white/70 backdrop-blur"
          >
            <ReactCountryFlag
              countryCode={countryCode}
              svg
              style={{ width: '110%', height: '110%', objectFit: 'cover', display: 'block' }}
            />
          </button>

          <span className="text-sm font-medium text-gray-700 hidden sm:block">{userEmail}</span>
          <button
            onClick={onLogout}
            className="flex items-center justify-center bg-gradient-to-b from-blue-400 to-blue-600 text-white px-5 py-2 rounded-full text-sm font-semibold hover:from-blue-500 hover:to-blue-700 transition-all shadow-md"
          >
            {t(language, 'Logout')}
          </button>
        </div>
      </div>
    </header>
  )
}"""
content = topbar_pattern.sub(new_topbar, content)

# Function to extract return of HomeDashboard
home_pattern = re.compile(r"(export default function HomeDashboard\(\) \{.*?)(  return \(\n    <div className=\"min-h-screen.*?  \)\n\})", re.DOTALL)
new_home_return = """  return (
    <div className="min-h-screen bg-[#eef3f8] flex flex-col font-sans">
      <Topbar userEmail={user?.email ?? ''} onLogout={handleLogout} />

      <main className="flex-1 relative overflow-hidden flex items-center justify-center p-4 sm:p-6 md:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden z-0">
          <div className="absolute top-[10%] left-[20%] h-96 w-96 rounded-full bg-blue-100/50 blur-3xl" />
          <div className="absolute bottom-[10%] right-[20%] h-96 w-96 rounded-full bg-indigo-100/50 blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-[1400px] flex gap-4 sm:gap-6 flex-col lg:flex-row items-stretch">
          
          {/* Left Column: QUICK ACCESS */}
          <div className="w-full lg:w-[220px] flex-shrink-0 flex flex-col pt-12 lg:pt-16">
            <h2 className="text-xs font-bold tracking-[0.15em] text-gray-900 mb-4 ml-2 uppercase">Quick Access</h2>
            <div className="bg-white/40 backdrop-blur-md rounded-[2rem] p-3 flex flex-col gap-3 shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-white flex-1">
              <ModuleButton href="/general-settings" icon={Cog6ToothIcon} title={t(language, 'Settings')} />
              {role && ['owner', 'admin', 'manager'].includes(role) && (
                <ModuleButton href="/crm" icon={Handshake} title="CRM" />
              )}
              {role && ['owner', 'admin', 'manager', 'staff'].includes(role) && (
                <ModuleButton href="/crm/referrals" icon={Target} title="Register" />
              )}
            </div>
          </div>

          {/* Center Column: ALL MODULES */}
          <div className="flex-1 flex flex-col">
            <div className="mb-6 px-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-green-200 px-3 py-1 text-xs text-green-700 bg-white/60 backdrop-blur-sm mb-4 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                {t(language, 'DashboardReady') || 'Dashboard ready'}
              </div>
              <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-gray-900 mb-2">
                {t(language, 'WelcomeTo')} <span className="font-bold text-blue-800">OddsOff</span>
              </h1>
              <p className="text-gray-500 text-lg">{t(language, 'DashboardSubtitle') || 'Central hub for your modules.'}</p>
            </div>

            <div className="bg-white/50 backdrop-blur-md rounded-[2.5rem] p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-white flex-1 relative flex flex-col">
              <h2 className="text-xs font-bold tracking-[0.15em] text-gray-900 mb-6 text-center uppercase">All Modules</h2>
              
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 place-content-start flex-1">
                <ModuleButton href="/materials" icon={CalculatorIcon} title={t(language, 'Costing')} />
                <ModuleButton href="/catering" icon={BuildingOffice2Icon} title={t(language, 'Catering')} />
                <ModuleButton href="/loyalty-manager" icon={UserGroupIcon} title="Loyalty Manager" />
                <BranchPickerCTA />
                
                {role && ['owner', 'admin', 'manager'].includes(role) && (
                  <ModuleButton href="/crm" icon={Handshake} title="CRM & Partnerships" />
                )}
                
                <ModuleButton href="/general-settings" icon={Cog6ToothIcon} title={t(language, 'Settings')} />
                <AssetBranchPickerCTA />
                
                {role && ['owner', 'admin'].includes(role) && (
                  <ModuleButton href="/monthly-reports" icon={LayoutDashboard} title="Monthly Reports" />
                )}
                
                {role && ['owner', 'admin', 'manager', 'staff'].includes(role) && (
                  <ModuleButton href="/crm/referrals" icon={Target} title="Register Referral" />
                )}
                
                <HRModuleCTA />
              </div>

              <p className="mt-8 text-xs text-gray-400 text-left px-2">{t(language, 'SoonMoreModules')}</p>
            </div>
          </div>

          {/* Right Column: RECENTLY VISITED */}
          <div className="w-full lg:w-[220px] flex-shrink-0 flex flex-col pt-12 lg:pt-16">
            <h2 className="text-xs font-bold tracking-[0.15em] text-gray-900 mb-4 ml-2 uppercase">Recently Visited</h2>
            <div className="bg-white/40 backdrop-blur-md rounded-[2rem] p-3 flex flex-col gap-3 shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-white flex-1">
              <BranchPickerCTA badge="Recent" active={true} />
              {role && ['owner', 'admin'].includes(role) && (
                <ModuleButton href="/monthly-reports" icon={LayoutDashboard} title="Monthly Reports" />
              )}
              <HRModuleCTA />
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}

/* ---------- Module Button Component ---------- */
function ModuleButton({
  icon: Icon,
  title,
  onClick,
  href,
  active,
  badge
}: {
  icon: any
  title: string
  onClick?: () => void
  href?: string
  active?: boolean
  badge?: string
}) {
  const inner = (
    <div className={`relative flex flex-col items-center justify-center p-4 min-h-[140px] w-full rounded-3xl bg-white transition-all duration-300 cursor-pointer group ${
      active 
      ? 'shadow-[0_8px_30px_rgba(37,99,235,0.15)] ring-2 ring-blue-400 border border-transparent scale-[1.02]' 
      : 'border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-0.5'
    }`}>
      {badge && (
        <span className="absolute -top-3 -right-1 bg-blue-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-md shadow-sm z-10 tracking-wide">
          {badge}
        </span>
      )}
      <Icon className={`w-8 h-8 mb-4 stroke-[1.5] transition-colors duration-300 ${
        active ? 'text-blue-700' : 'text-[#0a2540] group-hover:text-blue-600'
      }`} />
      <span className="text-[13px] font-medium text-center text-gray-800 leading-snug px-1">
        {title}
      </span>
    </div>
  )"""

content = home_pattern.sub(r"\1" + new_home_return, content)

# Replace CTAs
cta1 = re.compile(r"function BranchPickerCTA\(\) \{.*?return \(\n    <>\n      <button.*?      </button>\n      \{open && <BranchPickerModal onClose=\{\(\) => setOpen\(false\)\} />\}\n    </>\n  \)\n\}", re.DOTALL)
new_cta1 = """function BranchPickerCTA({ badge, active }: { badge?: string; active?: boolean }) {
  const [open, setOpen] = useState(false)
  const { language } = useSettings()
  return (
    <>
      <ModuleButton 
        icon={DocumentTextIcon} 
        title={t(language, 'DailyReports')} 
        onClick={() => setOpen(true)}
        badge={badge}
        active={active}
      />
      {open && <BranchPickerModal onClose={() => setOpen(false)} />}
    </>
  )
}"""
content = cta1.sub(new_cta1, content)

cta2 = re.compile(r"function AssetBranchPickerCTA\(\) \{.*?return \(\n    <>\n      <button.*?      </button>\n      \{open && <AssetBranchPickerModal onClose=\{\(\) => setOpen\(false\)\} />\}\n    </>\n  \)\n\}", re.DOTALL)
new_cta2 = """function AssetBranchPickerCTA({ badge, active }: { badge?: string; active?: boolean }) {
  const [open, setOpen] = useState(false)
  const { language } = useSettings()
  return (
    <>
      <ModuleButton 
        icon={Boxes} 
        title="Asset Inventory" 
        onClick={() => setOpen(true)}
        badge={badge}
        active={active}
      />
      {open && <AssetBranchPickerModal onClose={() => setOpen(false)} />}
    </>
  )
}"""
content = cta2.sub(new_cta2, content)

cta3 = re.compile(r"function HRModuleCTA\(\) \{.*?return \(\n    <>\n      <button.*?      </button>\n      \{open && <HRDashboardModal onClose=\{\(\) => setOpen\(false\)\} />\}\n    </>\n  \)\n\}", re.DOTALL)
new_cta3 = """function HRModuleCTA({ badge, active }: { badge?: string; active?: boolean }) {
  const [open, setOpen] = useState(false)
  const { language } = useSettings()
  return (
    <>
      <ModuleButton 
        icon={UserGroupIcon} 
        title={t(language, 'HumanResources') || 'Human Resources'} 
        onClick={() => setOpen(true)}
        badge={badge}
        active={active}
      />
      {open && <HRDashboardModal onClose={() => setOpen(false)} />}
    </>
  )
}"""
content = cta3.sub(new_cta3, content)

with open("src/app/dashboard/page.tsx", "w") as f:
    f.write(content)

