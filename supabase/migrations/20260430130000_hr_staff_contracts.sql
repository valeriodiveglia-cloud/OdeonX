CREATE TABLE public.hr_staff_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID NOT NULL REFERENCES public.hr_staff(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    signing_date DATE,
    expiration_date DATE,
    basic_salary NUMERIC DEFAULT 0,
    uniforms_allowance NUMERIC DEFAULT 0,
    lunch_allowance NUMERIC DEFAULT 0,
    phone_allowance NUMERIC DEFAULT 0,
    fuel_allowance NUMERIC DEFAULT 0,
    home_support_allowance NUMERIC DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.hr_staff_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users for hr_staff_contracts"
    ON public.hr_staff_contracts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert access to hr staff for hr_staff_contracts"
    ON public.hr_staff_contracts FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.app_accounts WHERE id = auth.uid() AND (role = 'admin' OR role = 'manager' OR role = 'owner')));

CREATE POLICY "Allow update access to hr staff for hr_staff_contracts"
    ON public.hr_staff_contracts FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.app_accounts WHERE id = auth.uid() AND (role = 'admin' OR role = 'manager' OR role = 'owner')));

CREATE POLICY "Allow delete access to hr staff for hr_staff_contracts"
    ON public.hr_staff_contracts FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.app_accounts WHERE id = auth.uid() AND (role = 'admin' OR role = 'manager' OR role = 'owner')));

INSERT INTO public.hr_staff_contracts (
    staff_id, version, signing_date, expiration_date, 
    basic_salary, uniforms_allowance, lunch_allowance, 
    phone_allowance, fuel_allowance, home_support_allowance
)
SELECT 
    id, 1, contract_signing_date, contract_expiration_date,
    COALESCE(basic_salary, 0), COALESCE(uniforms_allowance, 0), COALESCE(lunch_allowance, 0),
    COALESCE(phone_allowance, 0), COALESCE(fuel_allowance, 0), COALESCE(home_support_allowance, 0)
FROM public.hr_staff
WHERE contract_signing_date IS NOT NULL 
   OR contract_expiration_date IS NOT NULL 
   OR basic_salary > 0;

ALTER TABLE public.hr_staff 
  DROP COLUMN contract_signing_date,
  DROP COLUMN contract_expiration_date,
  DROP COLUMN basic_salary,
  DROP COLUMN uniforms_allowance,
  DROP COLUMN lunch_allowance,
  DROP COLUMN phone_allowance,
  DROP COLUMN fuel_allowance,
  DROP COLUMN home_support_allowance;
