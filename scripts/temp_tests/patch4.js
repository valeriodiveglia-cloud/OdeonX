const fs = require('fs')

let code = fs.readFileSync('src/app/crm/referrals/page.tsx', 'utf8')

// 1. Initial State
code = code.replace(
    /const \[partners, setPartners\] = useState<\w+.*>\(\[\]\)/,
    "const [partners, setPartners] = useState<{id: string, name: string, owner_id?: string}[]>([])\n    const [advisors, setAdvisors] = useState<any[]>([])"
)

code = code.replace(
    /partner_id: '',\n\s*arrival_date/,
    "sourceType: 'partner', // 'partner' | 'advisor'\n        partner_id: '',\n        advisor_user_id: '',\n        arrival_date"
)

// 2. Fetch Data
code = code.replace(
    /.select\('user_id, name, email'\)/,
    ".select('id, user_id, name, email, referral_code, role')"
)

code = code.replace(
    /if \(accountsRes\.data\) \{\n\s*const map/,
    "if (accountsRes.data) {\n            setAdvisors(accountsRes.data.filter(a => a.role === 'sale advisor' && a.referral_code))\n            const map"
)

// 3. Computed Commissions
const ccBase = code.substring(code.indexOf('const calculatedCommission = React.useMemo(() => {'), code.indexOf('}, [formData.revenue_generated, crmPartnerRules]);') + 50)
code = code.replace(
    /const calculatedCommission = React\.useMemo\(\(\) => \{[\s\S]*?\}, \[formData\.revenue_generated, crmPartnerRules\]\);/,
    `const calculatedCommission = React.useMemo(() => {
        if (formData.sourceType === 'advisor') return 0; // Advisor direct referral doesn't pay a partner
        if (!crmPartnerRules?.has_commission || isNaN(formData.revenue_generated)) return 0;
        let baseAmount = formData.revenue_generated;
        if (crmPartnerRules.commission_type === 'Percentage') {
            if (crmPartnerRules.commission_base === 'After Discount' && crmPartnerRules.has_discount) {
                const discount = crmPartnerRules.client_discount_type === 'Percentage' 
                    ? baseAmount * ((crmPartnerRules.client_discount_value || 0) / 100)
                    : (crmPartnerRules.client_discount_value || 0);
                baseAmount = Math.max(0, baseAmount - discount);
            }
            return baseAmount * ((crmPartnerRules.commission_value || 0) / 100);
        }
        return crmPartnerRules.commission_value || 0;
    }, [formData.revenue_generated, crmPartnerRules, formData.sourceType]);`
)

code = code.replace(
    /const calculatedDiscount = React\.useMemo\(\(\) => \{[\s\S]*?\}, \[formData\.revenue_generated, crmPartnerRules\]\);/,
    `const calculatedDiscount = React.useMemo(() => {
        if (isNaN(formData.revenue_generated)) return 0;
        if (formData.sourceType === 'advisor') {
            return formData.revenue_generated * ((crmCommissionRules?.direct_discount_pct || 0) / 100);
        }
        if (!crmPartnerRules?.has_discount) return 0;
        if (crmPartnerRules.client_discount_type === 'Percentage') {
            return formData.revenue_generated * ((crmPartnerRules.client_discount_value || 0) / 100);
        }
        return crmPartnerRules.client_discount_value || 0;
    }, [formData.revenue_generated, crmPartnerRules, crmCommissionRules, formData.sourceType]);`
)

// 4. Create submit logic
let newSubmit = `
            let advisor_commission_value = 0
            let targetPartnerId = null
            let targetSaleAdvisorId = null

            if (formData.sourceType === 'advisor') {
                targetSaleAdvisorId = formData.advisor_user_id
                advisor_commission_value = formData.revenue_generated * ((crmCommissionRules?.direct_commission_pct || 10) / 100)
            } else {
                targetPartnerId = formData.partner_id
                const partner = partners.find(p => p.id === formData.partner_id)
                targetSaleAdvisorId = partner?.owner_id || null

                if (partner?.owner_id) {
                    const activeCommType = crmCommissionType
                    const activeRules = crmCommissionRules
                    const flatRatePct = crmAdvisorCommissionPct

                    if (activeCommType === 'Standard Flat Percentage') {
                        advisor_commission_value = formData.revenue_generated * (flatRatePct / 100)
                    } else if (activeCommType === 'Acquisition + Maintenance' || activeCommType === 'Fixed Activation Bonus + Maintenance') {
                        const { count, error: countErr } = await supabase.from('crm_referrals').select('*', { count: 'exact', head: true }).eq('partner_id', formData.partner_id)
                        if (countErr) throw countErr
                        const isFirstReferral = count === 0
                        
                        if (activeCommType === 'Acquisition + Maintenance') {
                            const pct = isFirstReferral ? (activeRules?.acquisition_pct || 10) : (activeRules?.maintenance_pct || 4)
                            advisor_commission_value = formData.revenue_generated * (pct / 100)
                        } else if (activeCommType === 'Fixed Activation Bonus + Maintenance') {
                            if (isFirstReferral) advisor_commission_value = activeRules?.fixed_bonus || 100
                            else advisor_commission_value = formData.revenue_generated * ((activeRules?.maintenance_pct || 4) / 100)
                        }
                    }
                }
            }

            const { error } = await supabase.from('crm_referrals').insert([
                {
                    partner_id: targetPartnerId,
                    guest_name: 'N/A',
                    guest_contact: null,
                    arrival_date: formData.arrival_date || null,
                    party_size: formData.party_size,
                    revenue_generated: formData.revenue_generated,
                    commission_value: calculatedCommission,
                    status: formData.status,
                    sale_advisor_id: targetSaleAdvisorId,
                    advisor_commission_value: advisor_commission_value
                }
            ])
`

code = code.replace(
    /\/\/ Capture current owner_id[\s\S]*?advisor_commission_value: advisor_commission_value\n                \}\n            \]\)/,
    newSubmit.trim()
)

// Reset form
code = code.replace(
    /partner_id: '', arrival_date/,
    "sourceType: 'partner', partner_id: '', advisor_user_id: '', arrival_date"
)

// UI
let newModalTop = `
                                <div className="space-y-4 sm:col-span-2">
                                    <label className="block text-sm font-medium text-slate-700">Source Type</label>
                                    <div className="flex gap-4 p-1 bg-slate-100 rounded-xl w-fit">
                                        <button 
                                            type="button"
                                            onClick={() => setFormData({...formData, sourceType: 'partner'})}
                                            className={\`px-4 py-2 text-sm font-medium rounded-lg transition-all \${formData.sourceType === 'partner' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}\`}
                                        >
                                            External Partner
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setFormData({...formData, sourceType: 'advisor'})}
                                            className={\`px-4 py-2 text-sm font-medium rounded-lg transition-all \${formData.sourceType === 'advisor' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}\`}
                                        >
                                            Sale Advisor Code
                                        </button>
                                    </div>
                                </div>
                                
                                {formData.sourceType === 'partner' ? (
                                    <div className="space-y-2 sm:col-span-2 animate-in fade-in slide-in-from-top-2">
                                        <label className="block text-sm font-medium text-slate-700">Select Partner *</label>
                                        <select 
                                            required={formData.sourceType === 'partner'}
                                            value={formData.partner_id}
                                            onChange={e => setFormData({...formData, partner_id: e.target.value})}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        >
                                            <option value="">Choose partner...</option>
                                            {partners.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <div className="space-y-2 sm:col-span-2 animate-in fade-in slide-in-from-top-2">
                                        <label className="block text-sm font-medium text-slate-700">Select Advisor Code *</label>
                                        <select 
                                            required={formData.sourceType === 'advisor'}
                                            value={formData.advisor_user_id}
                                            onChange={e => setFormData({...formData, advisor_user_id: e.target.value})}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 focus:bg-white text-indigo-900 transition"
                                        >
                                            <option value="">Choose advisor code...</option>
                                            {advisors.map(a => (
                                                <option key={a.user_id} value={a.user_id}>{a.name || a.email} ({a.referral_code})</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
`

code = code.replace(
    /<div className="space-y-2 sm:col-span-2">\n\s*<label className="block text-sm font-medium text-slate-700">Select Partner \*\<\/label>[\s\S]*?<\/select>\n\s*<\/div>/,
    newModalTop.trim()
)

// UI details (commission display in modal): Since advisor commissions might not be rendered explicitly, but `calculatedCommission` is!
code = code.replace(
    /\{calculatedCommission > 0 && \([\s\S]*?\}\)/,
    `{(calculatedCommission > 0 || (formData.sourceType === 'advisor' && formData.revenue_generated > 0)) && (
                                    <div className="sm:col-span-2 flex items-center justify-between p-4 bg-emerald-50 rounded-xl border border-emerald-100 mt-2">
                                        <span className="text-sm font-medium text-emerald-800">Direct {formData.sourceType === 'advisor' ? 'Advisor' : 'Partner'} Commission:</span>
                                        <span className="text-lg font-bold text-emerald-600">
                                            {formatCurrencyInput((formData.sourceType === 'advisor' ? formData.revenue_generated * ((crmCommissionRules?.direct_commission_pct || 10) / 100) : calculatedCommission).toFixed(0))} {currency}
                                        </span>
                                    </div>
                                )}`
)

fs.writeFileSync('src/app/crm/referrals/page.tsx', code)
