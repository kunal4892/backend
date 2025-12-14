-- Database schema for content reports (AI-Generated Content Policy compliance)
-- This table stores user reports of offensive or inappropriate AI-generated content

CREATE TABLE IF NOT EXISTS content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  reported_by TEXT NOT NULL, -- Phone number of the user who reported
  reason TEXT NOT NULL CHECK (reason IN ('offensive', 'inappropriate', 'harmful', 'spam', 'other')),
  additional_info TEXT, -- Optional additional context from user
  message_text TEXT NOT NULL, -- Snapshot of the reported message text
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  reviewed_by TEXT, -- Admin/moderation team member who reviewed
  reviewed_at TIMESTAMPTZ,
  resolution_notes TEXT, -- Notes from moderation team
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_content_reports_message_id ON content_reports(message_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_thread_id ON content_reports(thread_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_reported_by ON content_reports(reported_by);
CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status);
CREATE INDEX IF NOT EXISTS idx_content_reports_created_at ON content_reports(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own reports
CREATE POLICY "Users can view their own reports"
  ON content_reports
  FOR SELECT
  USING (reported_by = current_setting('app.current_user_phone', true));

-- Policy: Users can insert their own reports
CREATE POLICY "Users can insert their own reports"
  ON content_reports
  FOR INSERT
  WITH CHECK (reported_by = current_setting('app.current_user_phone', true));

-- Policy: Service role can do everything (for backend functions)
CREATE POLICY "Service role full access"
  ON content_reports
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_content_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_content_reports_updated_at
  BEFORE UPDATE ON content_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_content_reports_updated_at();

-- Comments for documentation
COMMENT ON TABLE content_reports IS 'Stores user reports of offensive or inappropriate AI-generated content for Google Play compliance';
COMMENT ON COLUMN content_reports.reason IS 'Reason for reporting: offensive, inappropriate, harmful, spam, or other';
COMMENT ON COLUMN content_reports.status IS 'Report status: pending (awaiting review), reviewed (in review), resolved (action taken), dismissed (no action needed)';
COMMENT ON COLUMN content_reports.message_text IS 'Snapshot of the reported message text at time of reporting';



