// app/api/grade-bulk/route.ts
// Dipakai oleh mode "Upload Banyak Sekaligus". Beda dari /api/grade biasa:
// di sini kita BELUM tahu ini punya siswa siapa saat foto di-upload — jadi
// endpoint ini menilai dulu (termasuk baca nama dari foto, lintas semua
// halaman), lalu mencoba mencocokkan nama itu ke daftar siswa kelas. Kalau
// yakin, submission langsung disimpan. Kalau ragu, hasil dikembalikan ke
// client supaya guru pilih manual (lihat /api/finalize-bulk-match).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gradeSubmission } from "@/lib/claude";
import type { Question, MarkSchemeItem } from "@/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const wordsA = normalizeName(a).split(" ").filter(Boolean);
  const wordsB = normalizeName(b).split(" ").filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const setB = new Set(wordsB);
  const matched = wordsA.filter((w) => setB.has(w)).length;
  return matched / Math.max(wordsA.length, wordsB.length);
}

export async function POST(req: NextRequest) {
  try {
    const { exam_id, photo_urls } = await req.json();

    if (!exam_id || !photo_urls || !Array.isArray(photo_urls) || photo_urls.length === 0) {
      return NextResponse.json(
        { error: "exam_id dan photo_urls (array) wajib diisi" },
        { status: 400 }
      );
    }

    const { data: exam } = await supabase
      .from("exams")
      .select("id, class_id, subject_id, subjects(default_model)")
      .eq("id", exam_id)
      .single();

    if (!exam) {
      return NextResponse.json({ error: "Ujian tidak ditemukan" }, { status: 404 });
    }

    const modelToUse = (exam as any).subjects?.default_model ?? "claude-sonnet-5";

    const { data: questions } = await supabase
      .from("questions")
      .select("*")
      .eq("exam_id", exam_id)
      .order("order_index") as { data: Question[] | null };

    const { data: markSchemeItems } = await supabase
      .from("mark_scheme_items")
      .select("*")
      .in("question_id", (questions ?? []).map((q) => q.id)) as {
      data: MarkSchemeItem[] | null;
    };

    if (!questions || questions.length === 0) {
      return NextResponse.json(
        { error: "Ujian ini belum punya soal" },
        { status: 400 }
      );
    }

    const images = await Promise.all(
      (photo_urls as string[]).map(async (url) => {
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
      model: modelToUse,
    });

    const { data: students } = await supabase
      .from("students")
      .select("id, roll_number, full_name")
      .eq("class_id", exam.class_id);

    let bestMatch: { id: string; full_name: string; roll_number: number } | null = null;
    let bestScore = 0;

    if (result.student_name_read && students) {
      for (const s of students) {
        const score = similarity(result.student_name_read, s.full_name);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = s;
        }
      }
    }

    const CONFIDENT_THRESHOLD = 0.75;
    const totalScore = result.scores.reduce((sum, s) => sum + s.ai_score, 0);

    if (bestMatch && bestScore >= CONFIDENT_THRESHOLD) {
      const { data: submission, error: subError } = await supabase
        .from("submissions")
        .upsert(
          {
            exam_id,
            student_id: bestMatch.id,
            photo_urls,
            status: "processing",
          },
          { onConflict: "exam_id,student_id" }
        )
        .select("id")
        .single();

      if (subError || !submission) {
        throw new Error(subError?.message ?? "Gagal simpan submission");
      }

      const saveResult = await saveScores(submission.id, questions, result, totalScore, modelToUse);
      if (saveResult.error) {
        return NextResponse.json({ error: saveResult.error }, { status: 500 });
      }

      return NextResponse.json({
        matched: true,
        student: bestMatch,
        student_name_read: result.student_name_read,
        total_score: totalScore,
        scores: result.scores,
      });
    }

    return NextResponse.json({
      matched: false,
      student_name_read: result.student_name_read,
      best_guess: bestMatch,
      best_guess_score: bestScore,
      photo_urls,
      total_score: totalScore,
      scores: result.scores,
      model_used: modelToUse,
    });
  } catch (err: any) {
    console.error("Grade-bulk error:", err);
    return NextResponse.json(
      { error: err.message ?? "Gagal menilai" },
      { status: 500 }
    );
  }
}

async function saveScores(
  submissionId: string,
  questions: Question[],
  result: Awaited<ReturnType<typeof gradeSubmission>>,
  totalScore: number,
  modelUsed: string
): Promise<{ error?: string }> {
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
        if (!matched) return null;
        questionId = matched.id;
      }
      return {
        submission_id: submissionId,
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

  const { error: scoresError } = await supabase
    .from("question_scores")
    .upsert(rows, { onConflict: "submission_id,question_id" });

  if (scoresError) {
    await supabase.from("submissions").update({ status: "error" }).eq("id", submissionId);
    return { error: `Gagal simpan skor: ${scoresError.message}` };
  }

  await supabase
    .from("submissions")
    .update({
      status: "processed",
      total_ai_score: totalScore,
      ai_model_used: modelUsed,
      photo_urls: null,
    })
    .eq("id", submissionId);

  return {};
}
