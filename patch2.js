const fs = require('fs')

let code = fs.readFileSync('src/app/crm/settings/page.tsx', 'utf8')

// 1. imports and setup
code = code.replace(
    /import { Save, Settings, Users, Briefcase } from 'lucide-react'/,
    "import { Save, Settings, Users, Briefcase, Key } from 'lucide-react'\nimport { supabase } from '@/lib/supabase_shim'"
)

// 2. Add form state for direct params and advisors
code = code.replace(
    /maintenancePct: 4,\n\s*fixedBonus: 100\n\s*\}\)/,
    "maintenancePct: 4,\n        fixedBonus: 100,\n        directCommissionPct: 10,\n        directDiscountPct: 10\n    })"
)

// 3. Hydrate effect
code = code.replace(
    /maintenancePct: crmCommissionRules\?\.maintenance_pct \|\| 4,\n\s*fixedBonus: bonus\n\s*\}\)/,
    "maintenancePct: crmCommissionRules?.maintenance_pct || 4,\n            fixedBonus: bonus,\n            directCommissionPct: crmCommissionRules?.direct_commission_pct || 10,\n            directDiscountPct: crmCommissionRules?.direct_discount_pct || 10\n        })"
)

// 4. Save logic
code = code.replace(
    /let rules: any = \{ maintenance_pct: advisorFormData\.maintenancePct \}/,
    "let rules: any = { \n                maintenance_pct: advisorFormData.maintenancePct,\n                direct_commission_pct: advisorFormData.directCommissionPct,\n                direct_discount_pct: advisorFormData.directDiscountPct\n            }"
)

fs.writeFileSync('src/app/crm/settings/page.tsx', code)
