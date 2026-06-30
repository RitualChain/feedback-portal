-- Rename the passive native feedback source from quackback to ritualchain.
-- Idempotent: only touches rows still carrying the legacy source_type value.

UPDATE "feedback_sources"
SET
  "source_type" = 'ritualchain',
  "name" = CASE WHEN "name" = 'Quackback' THEN 'RitualChain' ELSE "name" END
WHERE "source_type" = 'quackback';

UPDATE "raw_feedback_items"
SET
  "source_type" = 'ritualchain',
  "dedupe_key" = REPLACE("dedupe_key", 'quackback:', 'ritualchain:')
WHERE "source_type" = 'quackback';
