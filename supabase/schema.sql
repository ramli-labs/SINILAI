-- ============================================================
-- SKEMA DATABASE: Sistem Koreksi Jawaban Ujian AI
-- Target: Supabase (PostgreSQL)
-- MVP Scope: Fisika, 1 kelas (7A Cambridge), 32 siswa
-- ============================================================

-- ------------------------------------------------------------
-- 1. GURU (terhubung ke Supabase Auth)
-- ------------------------------------------------------------
create table teachers (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. KELAS
-- ------------------------------------------------------------
create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,                -- contoh: "7A Cambridge"
  owner_teacher_id uuid not null references teachers(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Guru lain yang juga boleh akses kelas ini (opsional, untuk kolaborasi)
create table class_teachers (
  class_id uuid not null references classes(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  primary key (class_id, teacher_id)
);

-- ------------------------------------------------------------
-- 3. SISWA
-- ------------------------------------------------------------
create table students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  roll_number int not null,          -- no. absen = urutan input
  full_name text not null,
  gender text check (gender in ('L', 'P')),
  created_at timestamptz not null default now(),
  unique (class_id, roll_number)
);

-- ------------------------------------------------------------
-- 4. MATA PELAJARAN
-- ------------------------------------------------------------
create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,         -- Biologi, Fisika, Math, English, GP, ICT
  default_model text not null default 'claude-sonnet-5',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. UJIAN (mid-test, dsb)
-- ------------------------------------------------------------
create table exams (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id),
  title text not null,               -- "Mid Term 1 Physics"
  exam_date date,
  total_marks int not null,
  created_by uuid not null references teachers(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 6. SOAL (per sub-bagian, sesuai gaya Cambridge: 1(a), 1(b), dst)
-- ------------------------------------------------------------
create table questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  question_number text not null,     -- "1(a)", "1(b)", "2(a)(i)", dst
  question_text text,                -- opsional, teks soal untuk konteks AI
  max_marks int not null,
  order_index int not null,          -- urutan tampil
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 7. MARK SCHEME ITEMS (poin-poin penilaian per soal)
-- ------------------------------------------------------------
create table mark_scheme_items (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  mark_code text,                    -- "B1", "C1", "C2", "A3", dst (kode Cambridge)
  points int not null default 1,
  accepted_answers text not null,    -- deskripsi jawaban yang diterima (bisa multi-baris)
  order_index int not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 8. SUBMISSION (lembar jawaban 1 siswa untuk 1 ujian)
-- ------------------------------------------------------------
create table submissions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  photo_url text,                    -- sementara, dihapus setelah diproses (lihat kebijakan retensi)
  ocr_text text,                     -- hasil baca tulisan tangan (opsional, untuk audit)
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'processed', 'reviewed', 'error')),
  ai_model_used text,
  total_ai_score numeric,
  total_final_score numeric,         -- setelah dikoreksi guru (jika ada)
  reviewed_by uuid references teachers(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (exam_id, student_id)
);

-- ------------------------------------------------------------
-- 9. SKOR PER SOAL (hasil AI + koreksi guru)
-- ------------------------------------------------------------
create table question_scores (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  ai_score numeric not null,
  ai_reasoning text,                 -- alasan AI, per mark_code yang terpenuhi
  confidence text check (confidence in ('high', 'medium', 'low')),
  flagged_for_review boolean not null default false,
  teacher_override_score numeric,    -- diisi jika guru mengoreksi
  created_at timestamptz not null default now(),
  unique (submission_id, question_id)
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — guru hanya lihat data kelasnya sendiri
-- ============================================================
alter table classes enable row level security;
alter table students enable row level security;
alter table exams enable row level security;
alter table questions enable row level security;
alter table mark_scheme_items enable row level security;
alter table submissions enable row level security;
alter table question_scores enable row level security;

-- Guru hanya bisa akses kelas miliknya (owner atau anggota class_teachers)
create policy "teacher_access_own_classes" on classes
  for all using (
    owner_teacher_id = auth.uid()
    or id in (select class_id from class_teachers where teacher_id = auth.uid())
  );

create policy "teacher_access_own_students" on students
  for all using (
    class_id in (
      select id from classes
      where owner_teacher_id = auth.uid()
         or id in (select class_id from class_teachers where teacher_id = auth.uid())
    )
  );

create policy "teacher_access_own_exams" on exams
  for all using (
    class_id in (
      select id from classes
      where owner_teacher_id = auth.uid()
         or id in (select class_id from class_teachers where teacher_id = auth.uid())
    )
  );

create policy "teacher_access_own_questions" on questions
  for all using (
    exam_id in (select id from exams where class_id in (
      select id from classes
      where owner_teacher_id = auth.uid()
         or id in (select class_id from class_teachers where teacher_id = auth.uid())
    ))
  );

create policy "teacher_access_own_mark_scheme" on mark_scheme_items
  for all using (
    question_id in (select id from questions where exam_id in (
      select id from exams where class_id in (
        select id from classes
        where owner_teacher_id = auth.uid()
           or id in (select class_id from class_teachers where teacher_id = auth.uid())
      )
    ))
  );

create policy "teacher_access_own_submissions" on submissions
  for all using (
    exam_id in (select id from exams where class_id in (
      select id from classes
      where owner_teacher_id = auth.uid()
         or id in (select class_id from class_teachers where teacher_id = auth.uid())
    ))
  );

create policy "teacher_access_own_scores" on question_scores
  for all using (
    submission_id in (select id from submissions where exam_id in (
      select id from exams where class_id in (
        select id from classes
        where owner_teacher_id = auth.uid()
           or id in (select class_id from class_teachers where teacher_id = auth.uid())
      )
    ))
  );

-- ============================================================
-- SEED DATA AWAL: subjects (6 mapel Cambridge)
-- ============================================================
insert into subjects (name, default_model) values
  ('Biologi', 'claude-sonnet-5'),
  ('Fisika', 'claude-sonnet-5'),
  ('Math', 'claude-sonnet-5'),
  ('English', 'claude-sonnet-5'),
  ('GP', 'claude-sonnet-5'),
  ('ICT', 'claude-sonnet-5');

-- Catatan: default_model bisa diubah per mapel nanti (misal Haiku untuk Fisika/Math/ICT)
-- tanpa perlu ubah kode aplikasi — cukup update baris ini.
