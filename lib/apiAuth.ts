// lib/apiAuth.ts
// Pengecekan login & kepemilikan untuk endpoint API.
// Memakai klien Supabase milik guru yang login, sehingga aturan RLS
// (guru hanya boleh akses kelas miliknya) ikut berlaku.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function getTeacher() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export function unauthorized() {
  return NextResponse.json(
    { error: "Sesi login habis. Silakan login ulang." },
    { status: 401 }
  );
}

export function forbidden(msg = "Data tidak ditemukan atau bukan milik Anda.") {
  return NextResponse.json({ error: msg }, { status: 403 });
}

type Sb = Awaited<ReturnType<typeof createClient>>;

export async function teacherOwnsExam(supabase: Sb, examId: string) {
  const { data } = await supabase
    .from("exams")
    .select("id, class_id")
    .eq("id", examId)
    .maybeSingle();
  return data;
}

export async function teacherOwnsSubmission(supabase: Sb, submissionId: string) {
  const { data } = await supabase
    .from("submissions")
    .select("id")
    .eq("id", submissionId)
    .maybeSingle();
  return !!data;
}

export async function studentInClass(supabase: Sb, studentId: string, classId: string) {
  const { data } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("class_id", classId)
    .maybeSingle();
  return !!data;
}
