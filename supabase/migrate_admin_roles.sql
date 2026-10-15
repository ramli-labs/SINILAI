-- Migrasi 15 Okt 2026 — Peran admin. Jalankan SEKALI di Supabase SQL Editor.
-- Ganti email di langkah 2 bila email login SINILAI Anda berbeda.

-- 1) Kolom peran & status aktif
alter table teachers add column if not exists role text not null default 'teacher';
alter table teachers drop constraint if exists teachers_role_check;
alter table teachers add constraint teachers_role_check
  check (role in ('teacher', 'admin', 'super_admin'));
alter table teachers add column if not exists is_active boolean not null default true;

-- 2) Super admin pertama
update teachers set role = 'super_admin' where email = 'ramli@labschool.xyz';

-- 3) Fungsi cek admin (dipakai aturan RLS)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from teachers
    where id = auth.uid() and role in ('admin', 'super_admin') and is_active
  );
$$;

-- 4) Admin boleh mengakses semua data kelas
do $$
declare t text;
begin
  foreach t in array array['classes','students','exams','questions','mark_scheme_items','submissions','question_scores'] loop
    execute format('drop policy if exists admin_all on %I', t);
    execute format('create policy admin_all on %I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- 5) Lindungi tabel yang sebelumnya terbuka
--    teachers: semua guru boleh MEMBACA (untuk nama), hanya admin yang boleh mengubah
alter table teachers enable row level security;
drop policy if exists teachers_read on teachers;
create policy teachers_read on teachers for select using (auth.uid() is not null);
drop policy if exists teachers_admin_write on teachers;
create policy teachers_admin_write on teachers for all
  using (public.is_admin()) with check (public.is_admin());

--    subjects (pengaturan model AI): semua boleh membaca, hanya admin yang mengubah
alter table subjects enable row level security;
drop policy if exists subjects_read on subjects;
create policy subjects_read on subjects for select using (auth.uid() is not null);
drop policy if exists subjects_admin_write on subjects;
create policy subjects_admin_write on subjects for all
  using (public.is_admin()) with check (public.is_admin());

--    class_teachers: semua boleh membaca, yang mengubah hanya admin atau pemilik kelas.
--    PENTING: jangan pakai "for all" yang merujuk tabel classes — kebijakan classes juga
--    merujuk class_teachers sehingga terjadi rekursi tak berujung (kelas tidak terbaca).
create or replace function public.owns_class(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes where id = cid and owner_teacher_id = auth.uid());
$$;

alter table class_teachers enable row level security;
drop policy if exists class_teachers_read on class_teachers;
create policy class_teachers_read on class_teachers for select using (auth.uid() is not null);
drop policy if exists class_teachers_write on class_teachers;
drop policy if exists class_teachers_insert on class_teachers;
drop policy if exists class_teachers_update on class_teachers;
drop policy if exists class_teachers_delete on class_teachers;
create policy class_teachers_insert on class_teachers for insert
  with check (public.is_admin() or public.owns_class(class_id));
create policy class_teachers_update on class_teachers for update
  using (public.is_admin() or public.owns_class(class_id))
  with check (public.is_admin() or public.owns_class(class_id));
create policy class_teachers_delete on class_teachers for delete
  using (public.is_admin() or public.owns_class(class_id));

-- Cek hasil: harus muncul akun Anda dengan role super_admin
select full_name, email, role, is_active from teachers order by role desc, full_name;
