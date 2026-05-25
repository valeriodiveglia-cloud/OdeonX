ALTER TABLE fin_corporate_card_expenses
  ADD COLUMN supplier_id uuid REFERENCES suppliers(id),
  ADD COLUMN has_vat_invoice boolean NOT NULL DEFAULT false;
