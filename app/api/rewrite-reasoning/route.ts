// app/api/rewrite-reasoning/route.ts
// Buat deskripsi 1 soal (question_scores.id) sesuai nilai guru.
// - Dengan new_score: pakai nilai yang sedang diketik, hanya kembalikan draf
//   (disimpan nanti saat guru klik Simpan).
// - Tanpa new_score: pakai override yang tersimpan, langsung simpan ke
//   teacher_reasoning (dipakai tombol "Perbarui semua deskripsi").

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { rewriteReasoning } from "@/lib/rewriteReasoning";

const svc = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Silakan login dulu." }, { status: 401 });
    }

    const { score_id, new_score } = await req.json();
    const draftScore =
      typeof new_score === "number" && !Number.isNaN(new_score) ? new_score : null;
    if (!score_id) {
      return NextResponse.json({ error: "score_id wajib diisi" }, { status: 400 });
    }

    // Cek kepemilikan lewat RLS (klien milik guru yang login)
    const { data: owned } = await supabase
      .from("question_scores")
      .select("id")
      .eq("id", score_id)
      .single();
    if (!owned) {
      return NextResponse.json(
        { error: "Data tidak ditemukan atau bukan milik Anda." },
        { status: 404 }
      );
    }

    const { data: sc } = await svc
      .from("question_scores")
      .select("id, question_id, ai_score, ai_reasoning, teacher_override_score")
      .eq("id", score_id)
      .single();
    if (!sc) {
      return NextResponse.json({ error: "Data tidak ditemukan." }, { status: 404 });
    }
    const newScore = draftScore ?? sc.teacher_override_score;
    if (newScore == null) {
      return NextResponse.json(
        { error: "Isi dulu nilai Override untuk soal ini." },
        { status: 400 }
      );
    }

    const { data: q } = await svc
      .from("questions")
      .select("question_number, question_text, max_marks")
      .eq("id", sc.question_id)
      .single();

    const { data: markScheme } = await svc
      .from("mark_scheme_items")
      .select("mark_code, points, accepted_answers")
      .eq("question_id", sc.question_id)
      .order("order_index");

    const text = await rewriteReasoning({
      questionNumber: q?.question_number ?? "?",
      questionText: q?.question_text ?? null,
      maxMarks: q?.max_marks ?? 0,
      markScheme: markScheme ?? [],
      aiScore: sc.ai_score,
      aiReasoning: sc.ai_reasoning,
      newScore,
    });

    if (draftScore != null) {
      return NextResponse.json({ teacher_reasoning: text });
    }

    const { error: updError } = await svc
      .from("question_scores")
      .update({ teacher_reasoning: text })
      .eq("id", score_id);
    if (updError) throw new Error(updError.message);

    return NextResponse.json({ teacher_reasoning: text });
  } catch (err: any) {
    console.error("Rewrite reasoning error:", err);
    return NextResponse.json(
      { error: err.message ?? "Gagal membuat deskripsi" },
      { status: 500 }
    );
  }
}
