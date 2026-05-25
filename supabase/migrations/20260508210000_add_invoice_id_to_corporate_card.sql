ALTER TABLE fin_corporate_card_expenses ADD COLUMN invoice_id uuid REFERENCES fin_invoices(id);
