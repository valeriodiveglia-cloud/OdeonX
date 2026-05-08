-- Add city column to provider_branches
ALTER TABLE provider_branches ADD COLUMN IF NOT EXISTS city VARCHAR;
