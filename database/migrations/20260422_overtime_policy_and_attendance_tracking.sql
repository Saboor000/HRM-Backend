-- Adds strict overtime policy toggle and attendance tracking metrics.
-- Run in Supabase SQL editor before using latest checkout/overtime logic.

alter table if exists public.overtime_policies
  add column if not exists require_full_shift_for_overtime boolean not null default true;

alter table if exists public.attendance_records
  add column if not exists late_minutes integer not null default 0,
  add column if not exists early_exit_minutes integer not null default 0;
