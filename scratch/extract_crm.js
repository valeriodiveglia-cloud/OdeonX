const fs = require('fs');

const sql = fs.readFileSync('scratch/dev_schema.sql', 'utf8');

// Find all lines starting with CREATE POLICY "CRM... or ALTER TABLE ONLY "public"."crm_referrals"
const statements = sql.split(';\n');

const out = [];

for (const stmt of statements) {
    if (stmt.includes('CREATE POLICY "CRM ') || stmt.includes('CREATE POLICY "CRM_')) {
        out.push(stmt.trim() + ';');
    }
    if (stmt.includes('ALTER TABLE ONLY "public"."crm_referrals"') && stmt.includes('ADD CONSTRAINT')) {
        out.push(stmt.trim() + ';');
    }
    // Also include crm_tasks policies if any
}

fs.writeFileSync('scratch/crm_sync.sql', out.join('\n\n'));
console.log("Extracted " + out.length + " statements.");
