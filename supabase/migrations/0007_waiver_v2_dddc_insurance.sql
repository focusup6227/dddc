-- Wording tweak in v2 waiver: change "Dixon's maintains..." to
-- "DDDC maintains..." in the Animal Bailee insurance sentence so it
-- matches the abbreviation used elsewhere in the waiver.

update public.waivers
set body_markdown = replace(
  body_markdown,
  'Dixon''s maintains Animal Bailee',
  'DDDC maintains Animal Bailee'
)
where version = 'v2-2026-05';
