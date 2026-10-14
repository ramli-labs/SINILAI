-- Migrasi: deskripsi versi guru untuk soal yang nilainya diubah (override).
-- Jalankan sekali di Supabase SQL Editor.
-- Laporan Orang Tua memakai kolom ini bila terisi; bila kosong, memakai deskripsi AI.

alter table question_scores add column if not exists teacher_reasoning text;
