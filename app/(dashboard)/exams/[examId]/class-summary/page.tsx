import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function extractReasoning(raw: string | null): string {
  if (!raw) return "";
  const parts = raw.split("|");
  return parts.length >= 3 ? parts.slice(2).join("|").trim() : raw;
}

export default async function ClassSummaryPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const supabase = await createClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, subjects(name)")
    .eq("id", examId)
    .single();

  if (!exam) {
    return <p className="text-sm text-red-600">Ujian tidak ditemukan.</p>;
  }

  const svc = serviceClient();

  const { data: questions } = await svc
    .from("questions")
    .select("id, question_number, question_text, max_marks")
    .eq("exam_id", examId)
    .order("order_index");

  const { data: submissions } = await svc
    .from("submissions")
    .select("id")
    .eq("exam_id", examId)
    .in("status", ["processed", "reviewed"]);

  const submissionIds = (submissions ?? []).map((s) => s.id);

  const { data: allScores } = await svc
    .from("question_scores")
    .select("submission_id, question_id, ai_score, ai_reasoning, teacher_override_score")
    .in("submission_id", submissionIds.length > 0 ? submissionIds : [""]);

  const totalStudents = submissionIds.length;

  const summary = (questions ?? []).map((q) => {
    const scoresForQ = (allScores ?? []).filter((s) => s.question_id === q.id);

    let fullCount = 0;
    let partialCount = 0;
    let zeroCount = 0;
    let sampleReasoning = "";

    for (const s of scoresForQ) {
      const finalScore = s.teacher_override_score ?? s.ai_score;
      if (finalScore >= q.max_marks) {
        fullCount++;
      } else if (finalScore <= 0) {
        zeroCount++;
        if (!sampleReasoning) sampleReasoning = extractReasoning(s.ai_reasoning);
      } else {
        partialCount++;
        if (!sampleReasoning) sampleReasoning = extractReasoning(s.ai_reasoning);
      }
    }

    const attempted = scoresForQ.length;
    const strugglingCount = partialCount + zeroCount;
    const strugglingPct = attempted > 0 ? Math.round((strugglingCount / attempted) * 100) : 0;

    return {
      question: q,
      attempted,
      fullCount,
      partialCount,
      zeroCount,
      strugglingPct,
      sampleReasoning,
    };
  });

  summary.sort((a, b) => b.strugglingPct - a.strugglingPct);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-lg font-semibold">
        Rekap Kelemahan Kelas — {exam.title}
      </h1>
      <p className="mb-4 text-sm text-gray-500">
        {(exam as any).subjects?.name} · {totalStudents} siswa sudah dinilai.
        Diurutkan dari konsep yang paling banyak bikin siswa kesulitan.
      </p>

      {totalStudents === 0 && (
        <p className="text-sm text-gray-400">
          Belum ada siswa yang dinilai untuk ujian ini.
        </p>
      )}

      <div className="space-y-3">
        {summary.map((row) => {
          const level =
            row.strugglingPct >= 50
              ? { label: "Perlu diulang", color: "bg-red-50 border-red-200 text-red-700" }
              : row.strugglingPct >= 20
              ? { label: "Perlu penguatan", color: "bg-amber-50 border-amber-200 text-amber-700" }
              : { label: "Sudah baik", color: "bg-green-50 border-green-200 text-green-700" };

          return (
            <div
              key={row.question.id}
              className={`rounded-lg border p-4 shadow-sm ${level.color}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <p className="font-medium text-gray-800">
                  {row.question.question_number}
                  {row.question.question_text ? ` — ${row.question.question_text}` : ""}
                </p>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium">
                  {level.label}
                </span>
              </div>
              <p className="text-sm">
                {row.strugglingPct}% siswa ({row.partialCount + row.zeroCount} dari{" "}
                {row.attempted}) belum sepenuhnya menguasai — {row.fullCount} sudah benar penuh,{" "}
                {row.partialCount} sebagian, {row.zeroCount} belum paham sama sekali.
              </p>
              {row.sampleReasoning && (
                <p className="mt-1 text-xs text-gray-500">
                  Contoh kesalahan umum: <em>{row.sampleReasoning}</em>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
