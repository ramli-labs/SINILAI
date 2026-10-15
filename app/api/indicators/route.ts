// app/api/indicators/route.ts
// POST { exam_id }                         → buat indikator dengan AI untuk ujian ini
// POST { exam_id, rename: {from, to} }     → ganti teks satu indikator

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getTeacher, unauthorized, forbidden, teacherOwnsExam } from "@/lib/apiAuth";
import { generateIndicatorsForExam } from "@/lib/indicators";

const svc = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { supabase: userDb, user } = await getTeacher();
    if (!user) return unauthorized();

    const { exam_id, rename } = await req.json();
    if (!exam_id) return NextResponse.json({ error: "exam_id wajib diisi" }, { status: 400 });
    if (!(await teacherOwnsExam(userDb, exam_id))) return forbidden();

    if (rename?.from && typeof rename.to === "string") {
      const to = rename.to.trim().replace(/\.$/, "");
      if (!to) return NextResponse.json({ error: "Teks indikator kosong" }, { status: 400 });
      const { error } = await svc
        .from("questions")
        .update({ indicator: to })
        .eq("exam_id", exam_id)
        .eq("indicator", rename.from);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    const count = await generateIndicatorsForExam(svc, exam_id);
    return NextResponse.json({ ok: true, count });
  } catch (err: any) {
    console.error("Indicators error:", err);
    return NextResponse.json({ error: err.message ?? "Gagal membuat indikator" }, { status: 500 });
  }
}
