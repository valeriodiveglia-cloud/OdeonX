const fs = require('fs')

let code = fs.readFileSync('src/app/api/users/admin-upsert/route.ts', 'utf8')

// We need to inject the generation of referral_code
// Around line 72 where we parse role:
const injection = `
    const isSaleAdvisor = role === 'sale advisor'
    let generatedReferralCode = null
    if (isSaleAdvisor) {
      const parts = (payload.name || rawEmail || 'Advisor').split(' ')
      const first = parts[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
      generatedReferralCode = \`\${first}10\`
    }
`

code = code.replace(
    /const payload = \{/,
    `    const isSaleAdvisor = role === 'sale advisor'\n    let generatedReferralCode = null\n    if (isSaleAdvisor) {\n      const parts = (body?.name || rawEmail || 'Advisor').split(' ')\n      const first = parts[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase()\n      // Simple random suffix to reduce collision probability on initial creation\n      generatedReferralCode = \`\${first}10\`\n    }\n\n    const payload: any = {`
)

code = code.replace(
    /is_active: Boolean\(body\?\.is_active \?\? true\),/,
    `is_active: Boolean(body?.is_active ?? true),\n      ...(isSaleAdvisor && !idPresent ? { referral_code: generatedReferralCode } : {}),`
)

fs.writeFileSync('src/app/api/users/admin-upsert/route.ts', code)
