import { redirect } from "next/navigation";
import { fetchAllRows } from "@/lib/fetchAll";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import ExportExcelButton from "@/components/ExportExcelButton";
import ScoreRow from "@/components/ScoreRow";
import RewriteAllButton from "@/components/RewriteAllButton";

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function approveSubmissionAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const submissionId = formData.get("submissionId") as string;
  const examId = formData.get("examId") as string;

  const { data: ownedSubmission } = await supabase
    .from("submissions")
    .select("id")
    .eq("id", submissionId)
    .single();

  if (!ownedSubmission) {
    throw new Error("Submission tidak ditemukan atau bukan milik Anda");
  }

  const svc = serviceClient();

  const scoreIds = formData.getAll("scoreId") as string[];

  let totalFinal = 0;
  for (const scoreId of scoreIds) {
    const overrideRaw = formData.get(`override-${scoreId}`) as string;
    const aiScoreRaw = formData.get(`aiScore-${scoreId}`) as string;
    const maxRaw = formData.get(`max-${scoreId}`) as string | null;
    const maxMarks = maxRaw != null && maxRaw !== "" ? parseFloat(maxRaw) : null;
    let finalScore =
      overrideRaw !== "" && overrideRaw != null
        ? parseFloat(overrideRaw)
        : parseFloat(aiScoreRaw);
    // Jaga-jaga: nilai tidak boleh negatif atau melebihi nilai maksimal soal
    if (Number.isNaN(finalScore)) finalScore = parseFloat(aiScoreRaw) || 0;
    if (finalScore < 0) finalScore = 0;
    if (maxMarks != null && !Number.isNaN(maxMarks) && finalScore > maxMarks) {
      finalScore = maxMarks;
    }

    totalFinal += finalScore;

    const hasOverride = overrideRaw !== "" && overrideRaw != null;
    const hadOverride = formData.get(`hadOverride-${scoreId}`) === "1";

    if (hasOverride) {
      const update: Record<string, any> = { teacher_override_score: finalScore };
      const reasoningRaw = formData.get(`reasoning-${scoreId}`);
      if (reasoningRaw != null) {
        update.teacher_reasoning = String(reasoningRaw).trim() || null;
      }
      await svc.from("question_scores").update(update).eq("id", scoreId);
    } else if (hadOverride) {
      // Override dikosongkan guru: kembali ke nilai & deskripsi AI
      await svc
        .from("question_scores")
        .update({ teacher_override_score: null, teacher_reasoning: null })
        .eq("id", scoreId);
    }
  }

  await svc
    .from("submissions")
    .update({
      status: "reviewed",
      total_final_score: totalFinal,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  redirect(`/exams/${examId}/review`);
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const supabase = await createClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, total_marks")
    .eq("id", examId)
    .single();

  const { data: submissions } = await supabase
    .from("submissions")
    .select(
      "id, status, total_ai_score, total_final_score, students(roll_number, full_name)"
    )
    .eq("exam_id", examId)
    .order("created_at");

  const submissionIds = (submissions ?? []).map((s) => s.id);
  const svc = serviceClient();

  const { data: allScores, error: scoresError } = await fetchAllRows<any>(() =>
    svc
      .from("question_scores")
      .select(
        "id, submission_id, question_id, ai_score, ai_reasoning, confidence, flagged_for_review, teacher_override_score, teacher_reasoning"
      )
      .in("submission_id", submissionIds.length > 0 ? submissionIds : [""])
  );

  if (scoresError) {
    console.error("Gagal ambil question_scores:", scoresError.message);
  }

  const { data: examQuestions } = await svc
    .from("questions")
    .select("id, question_number, max_marks")
    .eq("exam_id", examId)
    .order("order_index");

  const questionById = new Map(
    (examQuestions ?? []).map((q) => [q.id, q])
  );

  // Urutkan skor sesuai urutan soal di ujian (1(a), 1(b), ...)
  const questionOrder = new Map(
    (examQuestions ?? []).map((q, i) => [q.id, i])
  );
  allScores.sort(
    (a: any, b: any) =>
      (questionOrder.get(a.question_id) ?? 9999) -
      (questionOrder.get(b.question_id) ?? 9999)
  );

  const exportRows = (submissions ?? []).map((sub: any) => {
    const scores = (allScores ?? []).filter((sc) => sc.submission_id === sub.id);
    const scoreByQuestionId = new Map(scores.map((sc: any) => [sc.question_id, sc]));

    const row: Record<string, any> = {
      "No. Absen": sub.students?.roll_number ?? "",
      "Nama Siswa": sub.students?.full_name ?? "",
    };

    for (const q of examQuestions ?? []) {
      const sc: any = scoreByQuestionId.get(q.id);
      const finalScore = sc?.teacher_override_score ?? sc?.ai_score;
      row[q.question_number] = finalScore ?? "-";
    }

    row["Total"] = sub.total_final_score ?? sub.total_ai_score ?? "-";
    row["Status"] = sub.status;

    return row;
  });

  return (
    <div>
      <div className="mb-1 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Review Nilai</h1>
          <p className="text-sm text-gray-500">
            {exam?.title} · Total {exam?.total_marks} poin
          </p>
        </div>
        {exportRows.length > 0 && (
          <ExportExcelButton
            data={exportRows}
            filename={`Nilai_${(exam?.title ?? "ujian").replace(/\s+/g, "_")}.xlsx`}
            sheetName="Nilai"
          />
        )}
      </div>
      <div className="mb-4" />

      <RewriteAllButton
        scoreIds={(allScores ?? [])
          .filter(
            (sc: any) =>
              sc.teacher_override_score != null &&
              Number(sc.teacher_override_score) !== Number(sc.ai_score) &&
              !sc.teacher_reasoning
          )
          .map((sc: any) => sc.id)}
      />

      <div className="space-y-4">
        {submissions?.map((sub: any) => {
          const scores = (allScores ?? []).filter(
            (sc) => sc.submission_id === sub.id
          );

          return (
            <div
              key={sub.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">
                  {sub.students?.roll_number}. {sub.students?.full_name}
                </p>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-xs " +
                    (sub.status === "reviewed"
                      ? "bg-green-100 text-green-700"
                      : sub.status === "processed"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-600")
                  }
                >
                  {sub.status}
                </span>
              </div>

              {scores.length === 0 ? (
                <p className="text-sm text-gray-400">Belum ada hasil penilaian.</p>
              ) : (
                <form action={approveSubmissionAction} className="space-y-2">
                  <input type="hidden" name="submissionId" value={sub.id} />
                  <input type="hidden" name="examId" value={examId} />

                  <table className="w-full text-sm">
                    <thead className="text-left text-gray-500">
                      <tr>
                        <th className="py-1">Soal</th>
                        <th className="py-1">Skor AI</th>
                        <th className="py-1">Alasan</th>
                        <th className="py-1">Override</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scores.map((sc: any) => {
                        const q = questionById.get(sc.question_id);
                        return (
                          <ScoreRow
                            key={`${sc.id}-${sc.teacher_override_score ?? ""}-${sc.teacher_reasoning ?? ""}`}
                            scoreId={sc.id}
                            questionNumber={q?.question_number ?? sc.question_id}
                            maxMarks={q?.max_marks ?? null}
                            aiScore={sc.ai_score}
                            aiReasoning={sc.ai_reasoning}
                            flagged={!!sc.flagged_for_review}
                            initialOverride={sc.teacher_override_score}
                            initialReasoning={sc.teacher_reasoning}
                          />
                        );
                      })}
                    </tbody>
                  </table>

                  <button
                    type="submit"
                    className="mt-2 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                  >
                    {sub.status === "reviewed" ? "Simpan Ulang" : "Setujui Nilai"}
                  </button>
                </form>
              )}
            </div>
          );
        })}

        {(!submissions || submissions.length === 0) && (
          <p className="text-sm text-gray-400">
            Belum ada lembar jawaban yang diupload.
          </p>
        )}
      </div>
    </div>
  );
}
