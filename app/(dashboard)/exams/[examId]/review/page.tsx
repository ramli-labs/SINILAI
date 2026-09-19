import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import ExportExcelButton from "@/components/ExportExcelButton";

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
    const finalScore =
      overrideRaw !== "" && overrideRaw != null
        ? parseFloat(overrideRaw)
        : parseFloat(aiScoreRaw);

    totalFinal += finalScore;

    if (overrideRaw !== "" && overrideRaw != null) {
      await svc
        .from("question_scores")
        .update({ teacher_override_score: finalScore })
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

  const { data: allScores, error: scoresError } = await svc
    .from("question_scores")
    .select(
      "id, submission_id, question_id, ai_score, ai_reasoning, confidence, flagged_for_review, teacher_override_score"
    )
    .in("submission_id", submissionIds.length > 0 ? submissionIds : [""]);

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
                        <tr
                          key={sc.id}
                          className={
                            "border-t border-gray-100 " +
                            (sc.flagged_for_review ? "bg-amber-50" : "")
                          }
                        >
                          <td className="py-1.5">
                            {q?.question_number ?? sc.question_id}
                            {sc.flagged_for_review && (
                              <span title={sc.ai_reasoning}> ⚠</span>
                            )}
                          </td>
                          <td className="py-1.5">
                            {sc.ai_score}/{q?.max_marks ?? "?"}
                            <input
                              type="hidden"
                              name={`aiScore-${sc.id}`}
                              value={sc.ai_score}
                            />
                            <input type="hidden" name="scoreId" value={sc.id} />
                          </td>
                          <td className="max-w-xs py-1.5 text-xs text-gray-500">
                            {sc.ai_reasoning}
                          </td>
                          <td className="py-1.5">
                            <input
                              type="number"
                              step="0.5"
                              name={`override-${sc.id}`}
                              placeholder={String(sc.ai_score)}
                              defaultValue={sc.teacher_override_score ?? ""}
                              className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm"
                            />
                          </td>
                        </tr>
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
