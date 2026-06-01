-- Text-message (SMS / RCS) notification consent + preferences on the customer
-- profile. This is the consent plumbing only — no messages are sent yet. A
-- customer opts in explicitly from their Account page; sending is gated on
-- sms_opt_in AND a null sms_opt_out_at (the latter is set when they reply STOP
-- to a message, handled outside this migration).
--
-- Consent is OFF by default: under TCPA we may not text a customer just because
-- we have their number. sms_opt_in_at records WHEN they consented (kept as
-- proof); sms_opt_out_at records a later STOP. notify_prefs lets a customer
-- mute individual message types while staying opted in.

alter table public.profiles
  add column if not exists sms_opt_in boolean not null default false,
  add column if not exists sms_opt_in_at timestamptz,
  add column if not exists sms_opt_out_at timestamptz,
  add column if not exists notify_prefs jsonb not null
    default '{"confirmations": true, "reminders": true, "report_cards": true}'::jsonb;
