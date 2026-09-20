// app/api/grade/route.ts
// Endpoint: terima submission_id, ambil data dari Supabase, panggil Claude API,
// simpan hasil ke question_scores, lalu hapus foto asli (kebijakan privasi).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gradeSubmission } from "@/lib/claude";
import type { Question, MarkSchemeItem } from "@/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { submission_id } = await req.json();

    if (!submission_id) {
      return NextResponse.json(
        { error: "submission_id is required" },
        { status: 400 }
      );
    }

    const { data: submission, error: subError } = await supabase
      .from("submissions")
      .select("id, exam_id, student_id, photo_urls, status")
      .eq("id", submission_id)
      .single();

    if (subError || !submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    if (!submission.photo_urls || submission.photo_urls.length === 0) {
      return NextResponse.json(
        { error: "No photos attached to this submission" },
        { status: 400 }
      );
    }

    await supabase
      .from("submissions")
      .update({ status: "processing" })
      .eq("id", submission_id);

    const { data: questions } = await supabase
      .from("questions")
      .select("*")
      .eq("exam_id", submission.exam_id)
      .order("order_index") as { data: Question[] | null };

    const { data: markSchemeItems } = await supabase
      .from("mark_scheme_items")
      .select("*")
      .in(
        "question_id",
        (questions ?? []).map((q) => q.id)
      ) as { data: MarkSchemeItem[] | null };

    if (!questions || questions.length === 0) {
      return NextResponse.json(
        { error: "No questions found for this exam" },
        { status: 400 }
      );
    }

    const images = await Promise.all(
      (submission.photo_urls as string[]).map(async (url) => {
        const photoResponse = await fetch(url);
        const photoBuffer = await photoResponse.arrayBuffer();
        const base64 = Buffer.from(photoBuffer).toString("base64");
        const mediaType = (photoResponse.headers.get("content-type") ??
          "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";
        return { base64, mediaType };
      })
    );

    const result = await gradeSubmission({
      images,
      questions,
      markSchemeItems: markSchemeItems ?? [],
    });

    const normalizeConfidence = (c: string): "high" | "medium" | "low" => {
      const lower = (c ?? "").toLowerCase().trim();
      if (lower === "high" || lower === "medium" || lower === "low") return lower;
      return "medium";
    };

    const isValidUuid = (v: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v ?? "");

    const questionByNumber = new Map(questions.map((q) => [q.question_number, q]));

    const rows = result.scores
      .map((s) => {
        let questionId = s.question_id;
        if (!isValidUuid(questionId)) {
          const matched = questionByNumber.get(s.question_number);
          if (!matched) {
            console.error(
              `Tidak bisa cocokkan question_id "${s.question_id}" (nomor "${s.question_number}") ke soal manapun — baris ini dilewati.`
            );
            return null;
          }
          questionId = matched.id;
        }
        return {
          submission_id,
          question_id: questionId,
          ai_score: s.ai_score,
          ai_reasoning: `Awarded: ${s.marks_awarded.join(", ") || "-"} | Missed: ${
            s.marks_missed.join(", ") || "-"
          } | ${s.reasoning}`,
          confidence: normalizeConfidence(s.confidence),
          flagged_for_review: s.flagged_for_review,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const { data: insertedRows, error: scoresError } = await supabase
      .from("question_scores")
      .upsert(rows, { onConflict: "submission_id,question_id" })
      .select();

    if (scoresError) {
      await supabase
        .from("submissions")
        .update({ status: "error" })
        .eq("id", submission_id);

      return NextResponse.json(
        { error: `Gagal simpan skor ke database: ${scoresError.message}` },
        { status: 500 }
      );
    }

    const totalScore = result.scores.reduce((sum, s) => sum + s.ai_score, 0);

    await supabase
      .from("submissions")
      .update({
        status: "processed",
        total_ai_score: totalScore,
        ai_model_used: "claude-sonnet-5",
        photo_urls: null,
      })
      .eq("id", submission_id);

    return NextResponse.json({
      submission_id,
      student_name_read: result.student_name_read,
      total_score: totalScore,
      scores: result.scores,
      debug_saved_rows_count: insertedRows?.length ?? 0,
      debug_saved_rows: insertedRows,
    });
  } catch (err: any) {
    console.error("Grading error:", err);
    return NextResponse.json(
      { error: err.message ?? "Unknown error during grading" },
      { status: 500 }
    );
  }
}
