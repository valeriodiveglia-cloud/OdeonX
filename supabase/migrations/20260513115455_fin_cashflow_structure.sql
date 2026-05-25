ALTER TABLE fin_chart_of_accounts
  ADD COLUMN cashflow_section TEXT DEFAULT 'Operating'
  CHECK (cashflow_section IN ('Operating', 'Investing', 'Financing', 'Exclude'));

CREATE TABLE fin_cashflow_category_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT NOT NULL UNIQUE,
  cashflow_section TEXT NOT NULL DEFAULT 'Operating'
    CHECK (cashflow_section IN ('Operating', 'Investing', 'Financing', 'Exclude')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE fin_cashflow_category_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read fin_cashflow_category_mapping"
  ON fin_cashflow_category_mapping FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert fin_cashflow_category_mapping"
  ON fin_cashflow_category_mapping FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update fin_cashflow_category_mapping"
  ON fin_cashflow_category_mapping FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete fin_cashflow_category_mapping"
  ON fin_cashflow_category_mapping FOR DELETE
  TO authenticated
  USING (true);
