-- Add employment type columns to hr_staff_salary_history
ALTER TABLE "public"."hr_staff_salary_history" 
ADD COLUMN "previous_employment_type" text,
ADD COLUMN "employment_type" text;

ALTER TABLE "public"."hr_staff_salary_history"
ADD CONSTRAINT "hr_staff_salary_history_previous_employment_type_check" 
CHECK (("previous_employment_type" = ANY (ARRAY['full_time'::text, 'part_time'::text, 'outsourced'::text]))),
ADD CONSTRAINT "hr_staff_salary_history_employment_type_check" 
CHECK (("employment_type" = ANY (ARRAY['full_time'::text, 'part_time'::text, 'outsourced'::text])));

-- Populate existing rows where possible
UPDATE "public"."hr_staff_salary_history"
SET 
  "previous_employment_type" = CASE WHEN "previous_salary_type" = 'fixed' THEN 'full_time' ELSE 'part_time' END,
  "employment_type" = CASE WHEN "salary_type" = 'fixed' THEN 'full_time' ELSE 'part_time' END
WHERE "employment_type" IS NULL;
