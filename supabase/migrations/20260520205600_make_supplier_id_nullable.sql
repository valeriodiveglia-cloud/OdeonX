-- Make supplier_id nullable on fin_invoices to support personal deduction invoices without regular suppliers
ALTER TABLE fin_invoices ALTER COLUMN supplier_id DROP NOT NULL;
