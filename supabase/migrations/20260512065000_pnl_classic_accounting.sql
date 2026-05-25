ALTER TABLE fin_chart_of_accounts DROP CONSTRAINT IF EXISTS fin_chart_of_accounts_account_type_check;

ALTER TABLE fin_chart_of_accounts ADD COLUMN IF NOT EXISTS show_in_pnl BOOLEAN DEFAULT false;
ALTER TABLE fin_chart_of_accounts ADD COLUMN IF NOT EXISTS show_in_cashflow BOOLEAN DEFAULT false;

-- Map existing types to the new standardized types
UPDATE fin_chart_of_accounts SET account_type = 'Operating Revenue' WHERE account_type = 'Revenue';
UPDATE fin_chart_of_accounts SET account_type = 'Cost of Goods Sold' WHERE account_type = 'COGS' AND code NOT LIKE '635%';
UPDATE fin_chart_of_accounts SET account_type = 'Financial Expenses' WHERE code LIKE '635%';
UPDATE fin_chart_of_accounts SET account_type = 'Selling Expenses' WHERE account_type = 'OPEX' AND code LIKE '641%';
UPDATE fin_chart_of_accounts SET account_type = 'General & Admin Expenses' WHERE account_type = 'OPEX' AND code NOT LIKE '641%';
UPDATE fin_chart_of_accounts SET account_type = 'Payroll' WHERE account_type = 'Salary';
UPDATE fin_chart_of_accounts SET account_type = 'Tax Expenses' WHERE account_type = 'Tax';
UPDATE fin_chart_of_accounts SET account_type = 'Other Expenses' WHERE account_type = 'Other Expense';
UPDATE fin_chart_of_accounts SET account_type = 'Financial Income' WHERE code LIKE '515%';

-- Enforce the new check constraint
ALTER TABLE fin_chart_of_accounts ADD CONSTRAINT fin_chart_of_accounts_account_type_check CHECK (account_type IN (
  'Asset', 
  'Liability', 
  'Equity', 
  'Operating Revenue', 
  'Other Income', 
  'Cost of Goods Sold', 
  'Selling Expenses', 
  'General & Admin Expenses', 
  'Payroll', 
  'Financial Income', 
  'Financial Expenses', 
  'Other Expenses', 
  'Tax Expenses'
));

-- Automatically toggle show_in_pnl based on the Class
UPDATE fin_chart_of_accounts SET show_in_pnl = true WHERE account_type IN (
  'Operating Revenue', 
  'Other Income', 
  'Cost of Goods Sold', 
  'Selling Expenses', 
  'General & Admin Expenses', 
  'Payroll', 
  'Financial Income', 
  'Financial Expenses', 
  'Other Expenses', 
  'Tax Expenses'
);

-- Toggle show_in_cashflow for Assets? 
-- Cash flow page currently groups ANY transaction by its category (i.e. 'Food', 'Bank Fees', etc.)
-- But the new requirement was "show_in_cashflow". Actually, we don't strictly need to set show_in_cashflow = true right now because they can configure it later.
-- Let's just set show_in_cashflow = true for everything in P&L for now, as that's what usually generates cash flows (revenues/expenses).
UPDATE fin_chart_of_accounts SET show_in_cashflow = true WHERE show_in_pnl = true;
