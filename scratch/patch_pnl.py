import sys

with open('scratch/pnl_page_old.tsx', 'r') as f:
    content = f.read()

# 1. Replace state
content = content.replace(
    "const [adjustments, setAdjustments] = useState({ discounts: 0, catering: 0, inventory: 0 })",
    "const [customAdjustments, setCustomAdjustments] = useState<any[]>([])"
)

# 2. Update query to fetch ALL branches if filtering, so we always get Global (All)
content = content.replace(
    ".eq('month_key', month),",
    ".eq('month_key', month).in('branch_id', branchFilter === 'All' ? ['All'] : [branchFilter, 'All']),"
)

# 3. Replace Adjustments extraction block (move it down)
old_adj_block = """            // Adjustments
            let discounts = 0, catering = 0, inventory = 0
            if (adjRes.data) {
                for (const a of adjRes.data) {
                    if (branchFilter !== 'All' && a.branch_id !== branchFilter && a.branch_id !== 'All') continue
                    discounts += Number(a.discounts_vnd || 0)
                    catering += Number(a.catering_revenue_vnd || 0)
                    inventory += Number(a.ending_inventory_vnd || 0)
                }
            }
            setAdjustments({ discounts, catering, inventory })"""
            
content = content.replace(old_adj_block, "")

# 4. Insert new adjustments processing after getAllocationFactor
new_adj_processing = """
            // Adjustments Processing (using allocation factor for global adjustments)
            const allBranchIds = brRes.data ? (brRes.data as any).map((b:any) => b.id) : []
            let finalAdjustments: any[] = []
            if (adjRes.data) {
                for (const row of adjRes.data) {
                    if (branchFilter !== 'All' && row.branch_id !== branchFilter && row.branch_id !== 'All') continue
                    
                    if (row.custom_adjustments && Array.isArray(row.custom_adjustments)) {
                        for (const adj of row.custom_adjustments) {
                            let amount = Number(adj.amount || 0)
                            if (row.branch_id === 'All') {
                                const factor = getAllocationFactor(null, allBranchIds, branchFilter)
                                amount = amount * factor
                            }
                            finalAdjustments.push({ ...adj, amount })
                        }
                    }
                }
            }
            setCustomAdjustments(finalAdjustments)"""

content = content.replace(
    "return 1 / branch_ids.length;\n            }",
    "return 1 / branch_ids.length;\n            }\n" + new_adj_processing
)

# 5. Update dependency array of useMemo
content = content.replace(
    "}, [coa, expensesByAccount, totalRevenue, adjustments])",
    "}, [coa, expensesByAccount, totalRevenue, customAdjustments])"
)

# 6. Update rendering logic inside useMemo
old_render_block_1 = """                    if (g.code === '01') {
                        const productsRevenue = Math.max(0, totalRevenue - adjustments.catering)
                        children.push({ code: '5112', name: 'Revenue from sales of products', amount: productsRevenue, isItem: true, parentCode: g.code })
                        groupTotal += productsRevenue
                        
                        children.push({ code: '51132', name: 'Event service fee revenue', amount: adjustments.catering, isItem: true, parentCode: g.code })
                        groupTotal += adjustments.catering

                        // Also include any accounts mapped to 'Operating Revenue'
                        const relevantAccounts = coa.filter(a => g.types.includes(a.account_type) && !a.is_group)
                        for (const acc of relevantAccounts) {
                            const amt = expensesByAccount[acc.id] || 0
                            children.push({ code: acc.code, name: acc.name, amount: amt, isItem: true, parentCode: g.code })
                            groupTotal += amt
                        }
                    } else if (g.code === '02') {
                        children.push({ code: '5211', name: 'Sales discount', amount: adjustments.discounts, isItem: true, parentCode: g.code })
                        groupTotal += adjustments.discounts
                    } else {"""

new_render_block_1 = """                    if (g.code === '01') {
                        let extractedAmount = 0
                        const extractedItems: PnLLine[] = []
                        const addedItems: PnLLine[] = []
                        
                        for (const adj of customAdjustments) {
                            if (adj.target_group === '01') {
                                if (adj.method === 'extract') {
                                    extractedAmount += adj.amount
                                    extractedItems.push({ code: '-', name: adj.name, amount: adj.amount, isItem: true, parentCode: g.code })
                                } else if (adj.method === 'add') {
                                    addedItems.push({ code: '-', name: adj.name, amount: adj.amount, isItem: true, parentCode: g.code })
                                } else if (adj.method === 'subtract') {
                                    addedItems.push({ code: '-', name: adj.name, amount: -adj.amount, isItem: true, parentCode: g.code })
                                }
                            }
                        }

                        const productsRevenue = Math.max(0, totalRevenue - extractedAmount)
                        children.push({ code: '5112', name: 'Revenue from sales of products', amount: productsRevenue, isItem: true, parentCode: g.code })
                        groupTotal += productsRevenue
                        
                        for (const ext of extractedItems) {
                            children.push(ext)
                            groupTotal += ext.amount
                        }
                        for (const add of addedItems) {
                            children.push(add)
                            groupTotal += add.amount
                        }

                        // Also include any accounts mapped to 'Operating Revenue'
                        const relevantAccounts = coa.filter(a => g.types.includes(a.account_type) && !a.is_group)
                        for (const acc of relevantAccounts) {
                            const amt = expensesByAccount[acc.id] || 0
                            children.push({ code: acc.code, name: acc.name, amount: amt, isItem: true, parentCode: g.code })
                            groupTotal += amt
                        }
                    } else if (g.code === '02') {
                        for (const adj of customAdjustments) {
                            if (adj.target_group === '02') {
                                const amount = adj.method === 'subtract' ? -adj.amount : adj.amount;
                                children.push({ code: '-', name: adj.name, amount: amount, isItem: true, parentCode: g.code })
                                groupTotal += amount
                            }
                        }
                    } else {"""

content = content.replace(old_render_block_1, new_render_block_1)

# 7. Add custom adjustments for all other groups
old_fallback_start = "                        // Fallback unassigned logic"
new_fallback_start = """                        // Custom Adjustments
                        for (const adj of customAdjustments) {
                            if (adj.target_group === g.code) {
                                const amount = adj.method === 'subtract' ? -adj.amount : adj.amount;
                                children.push({ code: '-', name: adj.name, amount: amount, isItem: true, parentCode: g.code })
                                groupTotal += amount
                            }
                        }
                        
                        // Fallback unassigned logic"""

content = content.replace(old_fallback_start, new_fallback_start)

with open('src/app/finance/pnl/page.tsx', 'w') as f:
    f.write(content)

print("Patch applied successfully.")
