-- Add ranked values column for ACT value keyword ranking (top 10)
ALTER TABLE user_settings
ADD COLUMN personalization_ranked_values JSONB DEFAULT '[]'::jsonb;
