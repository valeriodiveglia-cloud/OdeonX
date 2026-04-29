-- Add applicability columns to hr_disciplinary_catalog
ALTER TABLE hr_disciplinary_catalog
ADD COLUMN applicability_type text NOT NULL DEFAULT 'global' CHECK (applicability_type IN ('global', 'department', 'position')),
ADD COLUMN target_id uuid;

-- Comments for documentation
COMMENT ON COLUMN hr_disciplinary_catalog.applicability_type IS 'Scope of the infraction: global, department, or position';
COMMENT ON COLUMN hr_disciplinary_catalog.target_id IS 'UUID of the department or position, if applicable';
