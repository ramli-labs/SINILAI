// app/api/finalize-bulk-match/route.ts
// Dipakai setelah guru memilih manual siswa mana untuk foto yang tadi
// tidak yakin dicocokkan otomatis. Skor sudah dihitung sebelumnya oleh
// /api/grade-bulk — di sini TIDAK memanggil Claude lagi (hemat biaya),
// cukup simpan hasil yang sudah ada ke submission siswa yang dipilih.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { exam_id, student_id, photo_url, total_score, scores } = await req.json();

    if (!exam_id || !student_id || !scores) {
      return NextResponse.json(
        { error: "exam_id, student_id, dan scores wajib diisi" },
        { status: 400 }
      );
    }

    const { data: questions } = await supabase
      .from("questions")
      .select("id, question_number")
      .eq("exam_id", exam_id);

    const { data: submission, error: subError } = await supabase
      .from("submissions")
      .upsert(
        {
          exam_id,
          student_id,
          photo_url: photo_url ?? null,
          status: "processing",
        },
        { onConflict: "exam_id,student_id" }
      )
      .select("id")
      .single();

    if (subError || !submission) {
      throw new Error(subError?.message ?? "Gagal simpan submission");
    }

    const isValidUuid = (v: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v ?? "");
    const questionByNumber = new Map((questions ?? []).map((q) => [q.question_number, q]));

    const normalizeConfidence = (c: string): "high" | "medium" | "low" => {
      const lower = (c ?? "").toLowerCase().trim();
      if (lower === "high" || lower === "medium" || lower === "low") return lower;
      return "medium";
    };

    const rows = scores
      .map((s: any) => {
        let questionId = s.question_id;
        if (!isValidUuid(questionId)) {
          const matched = questionByNumber.get(s.question_number);
          if (!matched) return null;
          questionId = matched.id;
        }
        return {
          submission_id: submission.id,
          question_id: questionId,
          ai_score: s.ai_score,
          ai_reasoning: `Awarded: ${(s.marks_awarded ?? []).join(", ") || "-"} | Missed: ${
            (s.marks_missed ?? []).join(", ") || "-"
          } | ${s.reasoning ?? ""}`,
          confidence: normalizeConfidence(s.confidence),
          flagged_for_review: s.flagged_for_review ?? false,
        };
      })
      .filter((r: any) => r !== null);

    const { error: scoresError } = await supabase
      .from("question_scores")
      .upsert(rows, { onConflict: "submission_id,question_id" });

    if (scoresError) {
      await supabase.from("submissions").update({ status: "error" }).eq("id", submission.id);
      return NextResponse.json(
        { error: `Gagal simpan skor: ${scoresError.message}` },
        { status: 500 }
      );
    }

    await supabase
      .from("submissions")
      .update({
        status: "processed",
        total_ai_score: total_score,
        ai_model_used: "claude-sonnet-5",
        photo_url: null,
      })
      .eq("id", submission.id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Finalize-bulk-match error:", err);
    return NextResponse.json(
      { error: err.message ?? "Gagal menyimpan" },
      { status: 500 }
    );
  }
}
