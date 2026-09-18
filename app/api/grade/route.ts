// app/api/grade/route.ts
// Endpoint: terima submission_id, ambil data dari Supabase, panggil Claude API,
// simpan hasil ke question_scores, lalu hapus foto asli (kebijakan privasi).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gradeSubmission } from "@/lib/claude";
import type { Question, MarkSchemeItem } from "@/lib/types";

// Service role client — hanya dipakai di server, TIDAK pernah dikirim ke browser.
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

    // 1. Ambil submission + relasi exam
    const { data: submission, error: subError } = await supabase
      .from("submissions")
      .select("id, exam_id, student_id, photo_url, status")
      .eq("id", submission_id)
      .single();

    if (subError || !submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    if (!submission.photo_url) {
      return NextResponse.json(
        { error: "No photo attached to this submission" },
        { status: 400 }
      );
    }

    await supabase
      .from("submissions")
      .update({ status: "processing" })
      .eq("id", submission_id);

    // 2. Ambil soal + mark scheme untuk exam ini
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

    // 3. Ambil foto dan encode ke base64
    const photoResponse = await fetch(submission.photo_url);
    const photoBuffer = await photoResponse.arrayBuffer();
    const imageBase64 = Buffer.from(photoBuffer).toString("base64");
    const contentType = photoResponse.headers.get("content-type") ?? "image/jpeg";

    // 4. Panggil Claude API
    const result = await gradeSubmission({
      imageBase64,
      imageMediaType: contentType as "image/jpeg" | "image/png" | "image/webp",
      questions,
      markSchemeItems: markSchemeItems ?? [],
    });

    // 5. Simpan hasil ke question_scores
    // Sanitasi confidence: AI kadang mengembalikan variasi kapitalisasi/nilai
    // di luar ekspektasi. Kolom ini punya CHECK constraint (high/medium/low),
    // jadi nilai di luar itu HARUS dinormalisasi, atau insert akan gagal total.
    const normalizeConfidence = (c: string): "high" | "medium" | "low" => {
      const lower = (c ?? "").toLowerCase().trim();
      if (lower === "high" || lower === "medium" || lower === "low") return lower;
      return "medium"; // default aman kalau AI mengembalikan nilai tak terduga
    };

    const rows = result.scores.map((s) => ({
      submission_id,
      question_id: s.question_id,
      ai_score: s.ai_score,
      ai_reasoning: `Awarded: ${s.marks_awarded.join(", ") || "-"} | Missed: ${
        s.marks_missed.join(", ") || "-"
      } | ${s.reasoning}`,
      confidence: normalizeConfidence(s.confidence),
      flagged_for_review: s.flagged_for_review,
    }));

    const { error: scoresError } = await supabase
      .from("question_scores")
      .upsert(rows, { onConflict: "submission_id,question_id" });

    if (scoresError) {
      // Jangan gagal diam-diam — tandai submission error dan laporkan ke client
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

    // 6. Update submission: skor total, status, dan HAPUS foto (kebijakan privasi)
    await supabase
      .from("submissions")
      .update({
        status: "processed",
        total_ai_score: totalScore,
        ai_model_used: "claude-sonnet-5",
        photo_url: null, // foto asli tidak disimpan permanen
      })
      .eq("id", submission_id);

    // Catatan: jika photo_url menunjuk ke Supabase Storage, tambahkan juga
    // panggilan supabase.storage.from(...).remove([...]) di sini untuk
    // benar-benar menghapus file-nya, bukan cuma referensinya di database.

    return NextResponse.json({
      submission_id,
      student_name_read: result.student_name_read,
      total_score: totalScore,
      scores: result.scores,
    });
  } catch (err: any) {
    console.error("Grading error:", err);
    return NextResponse.json(
      { error: err.message ?? "Unknown error during grading" },
      { status: 500 }
    );
  }
}
