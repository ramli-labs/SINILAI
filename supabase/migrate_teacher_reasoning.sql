-- Migrasi 14 Okt 2026 — jalankan sekali di Supabase SQL Editor.

-- 1) Deskripsi versi guru untuk soal yang nilainya diubah (override).
--    Laporan Orang Tua memakai kolom ini bila terisi; bila kosong, memakai deskripsi AI.
alter table question_scores add column if not exists teacher_reasoning text;

-- 2) Nama mapel dalam bahasa Inggris (tampil di Laporan Orang Tua, dll.)
update subjects set name = 'Biology' where name = 'Biologi';
update subjects set name = 'Physics' where name = 'Fisika';
