-- Migration: Multi-Branch Support
-- Description: Convert branch_id (single) to branch_ids (array)

-- 1. Add new column
ALTER TABLE hiring_requests ADD COLUMN branch_ids TEXT[] DEFAULT '{}';

-- 2. Migrate existing data (if any)
UPDATE hiring_requests 
SET branch_ids = ARRAY[branch_id] 
WHERE branch_id IS NOT NULL;

-- 3. Drop old column 
-- Note: We drop the NOT NULL constraint on branch_id first if it exists, or just drop the column.
-- Since this is an active dev environment, we will soft-drop it (nullable) or hard drop it.
-- Let's hard drop it to force frontend errors and cleaner schema.
ALTER TABLE hiring_requests DROP COLUMN branch_id;
