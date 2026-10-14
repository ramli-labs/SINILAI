-- Migrasi: ganti model lama ke Claude Sonnet 5.5 / Haiku 5.5
-- Jalankan sekali di Supabase SQL Editor untuk database yang sudah ada.

alter table subjects alter column default_model set default 'claude-sonnet-5-5';

update subjects set default_model = 'claude-sonnet-5-5'
where default_model = 'claude-sonnet-5';

update subjects set default_model = 'claude-haiku-5-5'
where default_model in ('claude-haiku-4-5-20251001', 'claude-haiku-4-5', 'claude-haiku-5');
