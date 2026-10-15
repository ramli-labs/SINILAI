-- Migrasi 15 Okt 2026 — jalankan sekali di Supabase SQL Editor.
-- Deskripsi versi ramah orang tua (orang ketiga: "The student ...").
-- Laporan Orang Tua memakai: deskripsi guru (teacher_reasoning) > parent_feedback > deskripsi AI.
alter table question_scores add column if not exists parent_feedback text;
