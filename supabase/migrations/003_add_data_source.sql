ALTER TABLE community_submissions
  ADD COLUMN data_source TEXT NOT NULL DEFAULT 'user'
  CONSTRAINT valid_data_source CHECK (data_source IN ('user', 'demo', 'training'));
