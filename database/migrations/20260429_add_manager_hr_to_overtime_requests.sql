-- Migration: Add manager/hr approval fields to overtime_requests
-- Adds manager_status, hr_status and timestamp columns for approvals

ALTER TABLE overtime_requests
  ADD COLUMN IF NOT EXISTS manager_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS hr_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS manager_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS hr_approved_at timestamptz;

-- Optional: create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_overtime_requests_manager_status ON overtime_requests (manager_status);
CREATE INDEX IF NOT EXISTS idx_overtime_requests_hr_status ON overtime_requests (hr_status);
