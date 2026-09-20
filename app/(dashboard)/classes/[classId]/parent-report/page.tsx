import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import PrintReportButton from "@/components/PrintReportButton";
import ExportPdfZipButton from "@/components/ExportPdfZipButton";

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type Category = "baik" | "penguatan" | "kurang";

function categorize(score: number, max: number): Category {
  if (score >= max) return "baik";
  if (score <= 0) return "kurang";
  return "penguatan";
}

function extractReasoning(raw: string | null): string {
  if (!raw) return "";
  const parts = raw.split("|");
  return parts.length >= 3 ? parts.slice(2).join("|").trim() : raw;
}

export default async function ParentReportPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const supabase = await createClient();

  const { data: classData } = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", classId)
    .single();

  if (!classData) {
    return <p className="text-sm text-red-600">Kelas tidak ditemukan.</p>;
  }

  const svc = serviceClient();

  const { data: students } = await svc
    .from("students")
    .select("id, roll_number, full_name")
    .eq("class_id", classId)
    .order("roll_number");

  const { data: exams } = await svc
    .from("exams")
    .select("id, title, subject_id, subjects(name)")
    .eq("class_id", classId);

  const examIds = (exams ?? []).map((e) => e.id);

  const { data: submissions } = await svc
    .from("submissions")
    .select("id, exam_id, student_id, status, total_ai_score, total_final_score")
    .in("exam_id", examIds.length > 0 ? examIds : [""])
    .in("status", ["processed", "reviewed"]);

  const submissionIds = (submissions ?? []).map((s) => s.id);

  const { data: allScores } = await svc
    .from("question_scores")
    .select(
      "submission_id, question_id, ai_score, ai_reasoning, teacher_override_score"
    )
    .in("submission_id", submissionIds.length > 0 ? submissionIds : [""]);

  const { data: allQuestions } = await svc
    .from("questions")
    .select("id, exam_id, question_number, question_text, max_marks")
    .in("exam_id", examIds.length > 0 ? examIds : [""])
    .order("order_index");

  const questionById = new Map((allQuestions ?? []).map((q) => [q.id, q]));

  const report = (students ?? []).map((student) => {
    const subjectMap = new Map<string, { question_number: string; question_text: string | null; category: Category; reasoning: string }[]>();

    for (const exam of exams ?? []) {
      const subjectName = (exam as any).subjects?.name ?? "Lainnya";
      const submission = (submissions ?? []).find(
        (s) => s.exam_id === exam.id && s.student_id === student.id
      );
      if (!submission) continue;

      const scores = (allScores ?? []).filter(
        (sc) => sc.submission_id === submission.id
      );

      const items = scores.map((sc) => {
        const q = questionById.get(sc.question_id);
        const finalScore = sc.teacher_override_score ?? sc.ai_score;
        return {
          question_number: q?.question_number ?? "?",
          question_text: q?.question_text ?? null,
          category: categorize(finalScore, q?.max_marks ?? 1),
          reasoning: extractReasoning(sc.ai_reasoning),
        };
      });

      if (items.length > 0) {
        subjectMap.set(subjectName, [...(subjectMap.get(subjectName) ?? []), ...items]);
      }
    }

    return { student, subjects: Array.from(subjectMap.entries()) };
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="text-lg font-semibold">
          Laporan Orang Tua — {classData.name}
        </h1>
        <div className="flex gap-2">
          <ExportPdfZipButton
            entries={report.map(({ student }) => ({
              elementId: `report-card-${student.id}`,
              fileName: `Laporan_${student.full_name.replace(/\s+/g, "_")}`,
            }))}
            zipFileName={`Laporan_${classData.name.replace(/\s+/g, "_")}.zip`}
          />
          <PrintReportButton />
        </div>
      </div>

      <div className="space-y-8">
        {report.map(({ student, subjects }) => (
          <div
            key={student.id}
            id={`report-card-${student.id}`}
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm print:break-after-page print:border-0 print:shadow-none"
          >
            <div className="mb-4 border-b border-gray-200 pb-3 text-center">
              <img
                src="/logo.png"
                alt="School Logo"
                className="mx-auto mb-2 h-10 object-contain"
              />
              <h2 className="text-base font-semibold">Student Learning Report</h2>
            </div>

            <p className="mb-4 text-sm">
              <span className="font-medium">Name:</span> {student.full_name} ·{" "}
              <span className="font-medium">Class:</span> {classData.name}
            </p>

            {subjects.length === 0 && (
              <p className="text-sm text-gray-400">
                No exam results have been recorded for this student yet.
              </p>
            )}

            {subjects.map(([subjectName, items]) => {
              const baik = items.filter((i) => i.category === "baik");
              const penguatan = items.filter((i) => i.category === "penguatan");
              const kurang = items.filter((i) => i.category === "kurang");

              return (
                <div key={subjectName} className="mb-5">
                  <h3 className="mb-2 text-sm font-semibold text-gray-800">
                    {subjectName}
                  </h3>

                  {baik.length > 0 && (
                    <div className="mb-2">
                      <p className="text-sm font-medium text-green-700">
                        ✅ Mastered:
                      </p>
                      <ul className="ml-5 list-disc text-sm text-gray-700">
                        {baik.map((i, idx) => (
                          <li key={idx}>{i.question_text ?? i.question_number}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {penguatan.length > 0 && (
                    <div className="mb-2">
                      <p className="text-sm font-medium text-amber-700">
                        ⚠️ Needs Reinforcement:
                      </p>
                      <ul className="ml-5 list-disc text-sm text-gray-700">
                        {penguatan.map((i, idx) => (
                          <li key={idx}>
                            {i.question_text ?? i.question_number}
                            {i.reasoning && (
                              <span className="text-gray-500">
                                {" "}
                                — <em>{i.reasoning}</em>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {kurang.length > 0 && (
                    <div className="mb-2">
                      <p className="text-sm font-medium text-red-700">
                        ❌ Needs More Understanding:
                      </p>
                      <ul className="ml-5 list-disc text-sm text-gray-700">
                        {kurang.map((i, idx) => (
                          <li key={idx}>
                            {i.question_text ?? i.question_number}
                            {i.reasoning && (
                              <span className="text-gray-500">
                                {" "}
                                — <em>{i.reasoning}</em>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
