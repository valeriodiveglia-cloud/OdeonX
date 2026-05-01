ALTER TABLE hr_staff
ADD COLUMN basic_salary numeric DEFAULT 0,
ADD COLUMN uniforms_allowance numeric DEFAULT 0,
ADD COLUMN lunch_allowance numeric DEFAULT 0,
ADD COLUMN phone_allowance numeric DEFAULT 0,
ADD COLUMN fuel_allowance numeric DEFAULT 0,
ADD COLUMN home_support_allowance numeric DEFAULT 0;
