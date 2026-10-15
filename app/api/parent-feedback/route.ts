// app/api/parent-feedback/route.ts
// Ubah beberapa deskripsi sekaligus (maks 15) menjadi versi ramah orang tua.
// - Soal tanpa override  → hasil disimpan ke parent_feedback (dari deskripsi AI)
// - Soal dengan deskripsi guru yang masih "you/your" → hasil menimpa teacher_reasoning

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getTeacher, unauthorized } from "@/lib/apiAuth";
import { toParentFeedback, needsParentFeedback, extractReasoning } from "@/lib/parentFeedback";

const svc = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_BATCH = 15;

export async function POST(req: NextRequest) {
  try {
    const { supabase: userDb, user } = await getTeacher();
    if (!user) return unauthorized();

    const { score_ids } = await req.json();
    if (!Array.isArray(score_ids) || score_ids.length === 0) {
      return NextResponse.json({ error: "score_ids wajib diisi" }, { status: 400 });
    }
    const ids = (score_ids as string[]).slice(0, MAX_BATCH);

    // Hanya baris milik guru ini (RLS)
    const { data: owned } = await userDb.from("question_scores").select("id").in("id", ids);
    const ownedIds = new Set((owned ?? []).map((r: any) => r.id));
    if (ownedIds.size === 0) {
      return NextResponse.json({ error: "Data tidak ditemukan." }, { status: 404 });
    }

    const { data: rows } = await svc
      .from("question_scores")
      .select("id, question_id, ai_score, ai_reasoning, teacher_override_score, teacher_reasoning, parent_feedback")
      .in("id", Array.from(ownedIds));

    const qIds = Array.from(new Set((rows ?? []).map((r: any) => r.question_id)));
    const { data: questions } = await svc
      .from("questions")
      .select("id, question_number, question_text, max_marks")
      .in("id", qIds.length ? qIds : [""]);
    const qById = new Map((questions ?? []).map((q: any) => [q.id, q]));

    type Job = { id: string; target: "parent_feedback" | "teacher_reasoning"; text: string; question: string; score: string };
    const jobs: Job[] = [];
    for (const r of rows ?? []) {
      const q: any = qById.get(r.question_id);
      const question = `${q?.question_number ?? "?"}${q?.question_text ? ` ${String(q.question_text).slice(0, 160)}` : ""}`;
      if (!needsParentFeedback(r)) continue;
      const changed =
        r.teacher_override_score != null && Number(r.teacher_override_score) !== Number(r.ai_score);
      if (changed) {
        jobs.push({ id: r.id, target: "teacher_reasoning", text: r.teacher_reasoning, question, score: `${r.teacher_override_score}/${q?.max_marks ?? "?"}` });
      } else {
        jobs.push({ id: r.id, target: "parent_feedback", text: extractReasoning(r.ai_reasoning), question, score: `${r.ai_score}/${q?.max_marks ?? "?"}` });
      }
    }

    if (jobs.length === 0) return NextResponse.json({ updated: 0, skipped: ids.length });

    const result = await toParentFeedback(
      jobs.map((j) => ({ id: j.id, question: j.question, score: j.score, text: j.text }))
    );

    let updated = 0;
    for (const j of jobs) {
      // Bila AI melewatkan deskripsi ini, simpan teks sumbernya apa adanya supaya
      // tidak terus-menerus terhitung "belum" (bisa diedit manual di halaman Review).
      const text = result.get(j.id) || (j.target === "parent_feedback" ? j.text : null);
      if (!text) continue;
      const { error } = await svc.from("question_scores").update({ [j.target]: text }).eq("id", j.id);
      if (!error) updated++;
    }

    if (updated === 0) {
      return NextResponse.json({ error: "AI tidak menghasilkan deskripsi untuk batch ini." }, { status: 422 });
    }
    return NextResponse.json({ updated, skipped: ids.length - jobs.length });
  } catch (err: any) {
    console.error("Parent feedback error:", err);
    const msg = String(err?.message ?? "Gagal membuat deskripsi");
    const busy = /\((429|529|503)\)/.test(msg);
    const noAnswer = /AI tidak menghasilkan deskripsi/.test(msg);
    return NextResponse.json({ error: msg }, { status: busy ? 429 : noAnswer ? 422 : 500 });
  }
}
