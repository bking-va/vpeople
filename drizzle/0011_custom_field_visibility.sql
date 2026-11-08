-- Add visibility column to custom_fields
ALTER TABLE custom_fields ADD COLUMN visibility TEXT DEFAULT 'everyone' CHECK (visibility IN ('everyone', 'manager_hr', 'hr_only'));

-- Set Dietary Preferences to hr_only
UPDATE custom_fields SET visibility = 'hr_only' WHERE name = 'Dietary Preferences';
