-- Migrasi 15 Okt 2026 — jalankan sekali di Supabase SQL Editor.
-- Indikator (kalimat can-do) per soal; satu indikator mewakili beberapa soal.
alter table questions add column if not exists indicator text;
