import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Helper to load environment variables from .env.local
function loadEnv() {
  const envPath = path.resolve('.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local file not found');
  }
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      env[match[1]] = value;
    }
  });
  return env;
}

// Map UI page hrefs to database tables
const PAGE_TO_TABLE_MAP = {
  '/materials': ['materials'],
  '/recipes': ['final_recipes', 'prep_recipes', 'final_recipe_items', 'prep_recipe_items'],
  '/equipment': ['rental_equipment'],
  '/suppliers': ['suppliers'],
  '/daily-reports/closinglist': ['cashier_closings'],
  '/daily-reports/cashout': ['cashout'],
  '/daily-reports/banktransfers': ['daily_report_bank_transfers'],
  '/daily-reports/credits': ['credits', 'credit_payments'],
  '/daily-reports/deposits': ['deposits', 'deposit_payments'], // cash_ledger_deposits removed (moved to cash-ledger)
  '/crm/partners': ['crm_partners', 'crm_agreements', 'crm_documents'],
  '/crm/referrals': ['crm_referrals'],
  '/crm/commissions': ['crm_payouts'],
  '/finance/invoices': ['fin_invoices'],
  '/finance/payments': ['fin_payment_orders', 'fin_payment_order_items'],
  '/finance/accounts': ['fin_bank_accounts', 'fin_bank_transactions'],
  '/monthly-reports/cash-ledger': ['cash_ledger_deposits'], // Added here
};

// Parse APP_PAGES_DIRECTORY from src/lib/appPages.ts
function parseAppPages() {
  const filePath = path.resolve('src/lib/appPages.ts');
  if (!fs.existsSync(filePath)) {
    throw new Error(`File non trovato: ${filePath}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  
  const pageBlockRegex = /\{\s*id:\s*'([^']+)',\s*href:\s*'([^']+)',\s*title:\s*'([^']+)',\s*module:\s*'([^']+)'(?:,\s*icon:\s*[\w\d]+)?(?:,\s*requiresRole:\s*\[([^\]]+)\])?\s*\}/g;
  
  const pages = [];
  let match;
  while ((match = pageBlockRegex.exec(content)) !== null) {
    const id = match[1];
    const href = match[2];
    const title = match[3];
    const module = match[4];
    const rolesStr = match[5];
    
    const requiresRole = rolesStr 
      ? rolesStr.split(',').map(r => r.trim().replace(/['"]/g, '')) 
      : null; // null means no role limit (available to all authenticated users)
      
    pages.push({ id, href, title, module, requiresRole });
  }
  
  return pages;
}

// Parse allowed roles from policy fields
function parseRolesFromPolicy(policy) {
  const qual = ((policy.qual || '') + ' ' + (policy.with_check || '')).toLowerCase();
  const roles = [];
  
  // 1. Check for app_has_role(ARRAY['...', '...'])
  const arrayMatch = qual.match(/app_has_role\(array\[([^\]]+)\]/);
  if (arrayMatch) {
    arrayMatch[1].split(',').forEach(r => {
      roles.push(r.trim().replace(/['":\s]/g, '').replace(/text/g, ''));
    });
  }
  
  // 2. Check for role = ANY (ARRAY['...', '...'])
  const anyArrayMatch = qual.match(/role\s*=\s*any\s*\(array\[([^\]]+)\]/);
  if (anyArrayMatch) {
    anyArrayMatch[1].split(',').forEach(r => {
      roles.push(r.trim().replace(/['":\s]/g, '').replace(/text/g, ''));
    });
  }
  
  // 3. Check for specific helper functions
  if (qual.includes('app_is_admin_or_owner') || qual.includes('pb_insert_auth') || qual.includes('pb_update_auth')) {
    roles.push('owner', 'admin');
  }
  if (qual.includes('app_is_owner')) {
    roles.push('owner');
  }
  if (qual.includes('app_is_admin')) {
    roles.push('admin');
  }
  if (qual.includes('app_is_authenticated')) {
    roles.push('owner', 'admin', 'manager', 'staff', 'sale advisor', 'accountant');
  }

  // 4. If the database role lists specific postgres roles, or name includes Finance/Accountant
  if (policy.policyname.toLowerCase().includes('finance') || policy.policyname.toLowerCase().includes('accountant')) {
    roles.push('owner', 'accountant');
  }
  if (policy.policyname.toLowerCase().includes('admin access') || policy.policyname.toLowerCase().includes('manager access')) {
    roles.push('owner', 'admin', 'manager');
  }
  
  // 5. If policy is completely public or authenticated and has no specific qual filters, it's open to all
  const isAllAuth = policy.roles && (policy.roles.includes('public') || policy.roles.includes('authenticated'));
  if (isAllAuth && roles.length === 0) {
    return ['owner', 'admin', 'manager', 'staff', 'sale advisor', 'accountant'];
  }
  
  return roles;
}

async function runAudit() {
  console.log('🔍 Avvio Audit di Allineamento UI vs RLS...');
  
  try {
    const env = loadEnv();
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // 1. Recupero delle RLS dal database via RPC
    const { data: dbPolicies, error: dbErr } = await supabase.rpc('get_policies');
    if (dbErr) throw dbErr;
    
    // 2. Lettura dei permessi delle pagine UI
    const uiPages = parseAppPages();
    
    console.log(`📋 Trovate ${uiPages.length} pagine nella UI.`);
    console.log(`🗄️ Trovate ${dbPolicies.length} policy RLS nel Database.`);
    console.log('--------------------------------------------------');
    
    let anomaliesCount = 0;
    
    for (const page of uiPages) {
      const mappedTables = PAGE_TO_TABLE_MAP[page.href];
      if (!mappedTables) {
        continue;
      }
      
      for (const table of mappedTables) {
        const tablePolicies = dbPolicies.filter(p => p.tablename === table);
        
        if (tablePolicies.length === 0) {
          console.warn(`⚠️ Tabella [${table}] (mappata su ${page.href}) non ha policy RLS attive!`);
          anomaliesCount++;
          continue;
        }
        
        // CUMULATIVE ROLE RESOLUTION (PostgreSQL OR logic)
        // Aggreghiamo tutti i ruoli ammessi da *qualsiasi* policy della tabella
        const cumulativeAllowedRoles = new Set();
        
        for (const policy of tablePolicies) {
          const allowedRoles = parseRolesFromPolicy(policy);
          allowedRoles.forEach(r => cumulativeAllowedRoles.add(r));
        }
        
        const allowedRolesArray = Array.from(cumulativeAllowedRoles);
        
        // Se la tabella è aperta a tutti (es. nessuna restrizione), saltiamo il controllo
        if (allowedRolesArray.includes('staff') && allowedRolesArray.includes('sale advisor')) {
          continue;
        }
        
        // Confrontiamo i ruoli richiesti dalla UI con i ruoli cumulativi del DB
        const uiRolesToCheck = page.requiresRole || ['owner', 'admin', 'manager', 'staff', 'sale advisor', 'accountant'];
        
        const forbiddenRoles = uiRolesToCheck.filter(r => !allowedRolesArray.includes(r));
        
        if (forbiddenRoles.length > 0) {
          console.error(`❌ DISALLINEAMENTO RILEVATO!`);
          console.error(`   Pagina UI : ${page.href} (${page.title})`);
          console.error(`   Ruoli UI ammessi : [${uiRolesToCheck.join(', ')}]`);
          console.error(`   Tabella DB: ${table}`);
          console.error(`   Ruoli DB ammessi : [${allowedRolesArray.join(', ')}]`);
          console.error(`   Rischio   : I ruoli [${forbiddenRoles.join(', ')}] vedono la UI ma le query falliranno silenziosamente a livello DB (RLS).`);
          console.error('--------------------------------------------------');
          anomaliesCount++;
        }
      }
    }
    
    if (anomaliesCount === 0) {
      console.log('✅ AUDIT COMPLETATO: Tutte le pagine UI e le policy RLS del database sono allineate!');
    } else {
      console.warn(`⚠️ AUDIT COMPLETATO: Trovate ${anomaliesCount} discrepanze reali tra RLS e UI. Rivedere i permessi.`);
    }
    
  } catch (error) {
    console.error('❌ Errore durante l\'esecuzione dell\'audit:', error.message);
    process.exitCode = 1;
  }
}

runAudit();
