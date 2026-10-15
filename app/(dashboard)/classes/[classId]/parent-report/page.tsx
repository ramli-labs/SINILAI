import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetchAll";
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

// Buang catatan internal dari teks soal (dibuat AI saat mengurai dokumen soal),
// misalnya "(statement text truncated in source)" atau "(… mark scheme …, so check)".
// Teks soal di database tidak diubah; ini hanya untuk tampilan laporan.
const INTERNAL_NOTE =
  /\s*\((?=[^()]*\b(source|extracted|mark scheme|check|truncated|uncertain|unclear|verify|inconsistent|header|not in|missing|ocr)\b)[^()]*\)/gi;
function cleanQuestionText(text: string | null): string | null {
  if (!text) return text;
  const cleaned = text.replace(INTERNAL_NOTE, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || null;
}

function extractReasoning(raw: string | null): string {
  if (!raw) return "";
  const parts = raw.split("|");
  return parts.length >= 3 ? parts.slice(2).join("|").trim() : raw;
}

// Peta indikator per ujian: indikator → daftar nomor soal (diringkas jadi rentang
// bila berurutan, mis. "1(a)–3(b)").
type IndicatorMapEntry = { indicator: string; questions: string };

function formatRuns(nums: string[], idxs: number[]): string {
  const runs: string[] = [];
  let start = 0;
  for (let i = 1; i <= idxs.length; i++) {
    if (i === idxs.length || idxs[i] !== idxs[i - 1] + 1) {
      const len = i - start;
      if (len === 1) runs.push(nums[start]);
      else if (len === 2) runs.push(`${nums[start]}, ${nums[i - 1]}`);
      else runs.push(`${nums[start]}–${nums[i - 1]}`);
      start = i;
    }
  }
  return runs.join(", ");
}

function buildIndicatorMap(questions: { question_number: string; indicator: string | null }[]): IndicatorMapEntry[] {
  const groups: { indicator: string; nums: string[]; idxs: number[] }[] = [];
  questions.forEach((q, i) => {
    if (!q.indicator) return;
    let g = groups.find((x) => x.indicator === q.indicator);
    if (!g) {
      g = { indicator: q.indicator, nums: [], idxs: [] };
      groups.push(g);
    }
    g.nums.push(q.question_number);
    g.idxs.push(i);
  });
  return groups.map((g) => ({ indicator: g.indicator, questions: formatRuns(g.nums, g.idxs) }));
}

type ReportItem = {
  question_number: string;
  question_text: string | null;
  indicator: string | null;
  category: Category;
  reasoning: string;
  score: number;
  max: number;
};

// Kelompokkan item per indikator, urutan sesuai kemunculan pertama
function groupByIndicator(items: ReportItem[]) {
  const groups: { indicator: string | null; items: ReportItem[] }[] = [];
  for (const it of items) {
    let g = groups.find((x) => x.indicator === it.indicator);
    if (!g) {
      g = { indicator: it.indicator, items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }
  return groups;
}

function ItemLine({ i }: { i: ReportItem }) {
  return (
    <>
      {i.question_text ?? i.question_number}
      {i.reasoning && (
        <span className="text-gray-500">
          {" "}
          — <em>{i.reasoning}</em>
        </span>
      )}
    </>
  );
}

// Daftar soal yang perlu perhatian. Bila ada indikator, dikelompokkan per indikator.
function NeedsList({
  items,
  useIndicators,
  counts,
}: {
  items: ReportItem[];
  useIndicators: boolean;
  counts: Map<string | null, { correct: number; total: number }>;
}) {
  if (!useIndicators) {
    return (
      <ul className="ml-5 list-disc text-sm text-gray-700">
        {items.map((i, idx) => (
          <li key={idx} className="break-inside-avoid">
            <ItemLine i={i} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="ml-5 list-disc space-y-1 text-sm text-gray-700">
      {groupByIndicator(items).map((g, gi) => (
        <li key={gi} className="break-inside-avoid">
          <span className="font-medium text-gray-800">{g.indicator ?? "Other skills"}</span>
          {counts.get(g.indicator) && (
            <span className="text-gray-500">
              {" "}
              ({counts.get(g.indicator)!.correct} of {counts.get(g.indicator)!.total} correct)
            </span>
          )}
          <ul className="ml-5 list-[circle]">
            {g.items.map((i, idx) => (
              <li key={idx}>
                <ItemLine i={i} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
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

  const { data: allScores } = await fetchAllRows<any>(() =>
    svc
      .from("question_scores")
      .select(
        "id, submission_id, question_id, ai_score, ai_reasoning, teacher_override_score, teacher_reasoning, parent_feedback"
      )
      .in("submission_id", submissionIds.length > 0 ? submissionIds : [""])
  );

  const { data: allQuestions } = await svc
    .from("questions")
    .select("id, exam_id, question_number, question_text, max_marks, indicator")
    .in("exam_id", examIds.length > 0 ? examIds : [""])
    .order("order_index");

  const questionById = new Map((allQuestions ?? []).map((q) => [q.id, q]));
  // Urutkan skor sesuai urutan soal di ujian (1(a), 1(b), ...)
  const questionOrder = new Map((allQuestions ?? []).map((q, i) => [q.id, i]));
  allScores.sort(
    (a: any, b: any) =>
      (questionOrder.get(a.question_id) ?? 9999) -
      (questionOrder.get(b.question_id) ?? 9999)
  );

  const indicatorMapByExam = new Map<string, IndicatorMapEntry[]>();
  for (const exam of exams ?? []) {
    const qs = (allQuestions ?? []).filter((q: any) => q.exam_id === exam.id) as any[];
    indicatorMapByExam.set(exam.id, buildIndicatorMap(qs));
  }

  const report = (students ?? []).map((student) => {
    const subjectMap = new Map<string, ReportItem[]>();
    const indicatorMap: { subject: string; entries: IndicatorMapEntry[] }[] = [];

    for (const exam of exams ?? []) {
      const subjectName = (exam as any).subjects?.name ?? "Other";
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
          question_text: cleanQuestionText(q?.question_text ?? null),
          indicator: (q as any)?.indicator ?? null,
          category: categorize(finalScore, q?.max_marks ?? 1),
          score: Number(finalScore) || 0,
          max: Number(q?.max_marks) || 0,
          reasoning: (sc.teacher_reasoning?.trim() || sc.parent_feedback?.trim() || extractReasoning(sc.ai_reasoning)),
        };
      });

      if (items.length > 0) {
        subjectMap.set(subjectName, [...(subjectMap.get(subjectName) ?? []), ...items]);
        const entries = indicatorMapByExam.get(exam.id) ?? [];
        if (entries.length > 0) {
          const existing = indicatorMap.find((m) => m.subject === subjectName);
          if (existing) existing.entries.push(...entries);
          else indicatorMap.push({ subject: subjectName, entries: [...entries] });
        }
      }
    }

    return { student, subjects: Array.from(subjectMap.entries()), indicatorMap };
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
              footer: `${student.full_name} · ${classData.name}`,
            }))}
            zipFileName={`Laporan_${classData.name.replace(/\s+/g, "_")}.zip`}
          />
          <PrintReportButton />
        </div>
      </div>

      <div className="space-y-8">
        {report.map(({ student, subjects, indicatorMap }) => (
          <div
            key={student.id}
            id={`report-card-${student.id}`}
            lang="en"
            className="report-justify rounded-lg border border-gray-200 bg-white p-6 shadow-sm print:break-after-page print:border-0 print:shadow-none"
          >
            <div className="mb-4 border-b border-gray-200 pb-3 text-center">
              <img
                src="/logo.png"
                alt="School Logo"
                className="mx-auto mb-2 h-20 object-contain"
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
              // Pakai indikator bila soal-soal mapel ini sudah punya indikator
              const useIndicators = items.some((i) => i.indicator);

              // Tanpa indikator: kategori per soal (seperti sebelumnya).
              // Dengan indikator: kategori per indikator dari persentase perolehan nilai:
              //   100% → Mastered, >= 50% → Needs Reinforcement, < 50% → Needs More Understanding.
              //   Yang ditampilkan di bawah indikator hanya soal yang belum benar penuh.
              let penguatan = items.filter((i) => i.category === "penguatan");
              let kurang = items.filter((i) => i.category === "kurang");
              let masteredIndicators: string[] = [];
              if (useIndicators) {
                penguatan = [];
                kurang = [];
                for (const g of groupByIndicator(items)) {
                  const got = g.items.reduce((n, i) => n + i.score, 0);
                  const max = g.items.reduce((n, i) => n + i.max, 0);
                  const ratio = max > 0 ? got / max : 0;
                  const allCorrect = g.items.every((i) => i.category === "baik");
                  const notYet = g.items.filter((i) => i.category !== "baik");
                  if (allCorrect) {
                    if (g.indicator) masteredIndicators.push(g.indicator);
                  } else if (ratio >= 0.5) {
                    penguatan.push(...notYet);
                  } else {
                    kurang.push(...notYet);
                  }
                }
              }
              // Jumlah soal benar penuh per indikator (dari semua soal mapel ini)
              const indicatorCounts = new Map<string | null, { correct: number; total: number }>();
              for (const g of groupByIndicator(items)) {
                indicatorCounts.set(g.indicator, {
                  correct: g.items.filter((i) => i.category === "baik").length,
                  total: g.items.length,
                });
              }

              return (
                <div key={subjectName} className="mb-5 break-inside-avoid">
                  <h3 className="mb-2 break-after-avoid border-b border-gray-200 pb-1 text-sm font-semibold text-gray-800">
                    {subjectName}
                  </h3>

                  {useIndicators ? (
                    <div className="mb-2">
                      <p className="text-sm text-green-700">
                        <span className="font-medium">✅ Mastered</span>{" "}
                        <span className="text-gray-600">
                          ({baik.length} of {items.length} questions answered fully correctly)
                        </span>
                        {masteredIndicators.length > 0 ? ":" : ""}
                      </p>
                      {masteredIndicators.length > 0 && (
                        <ul className="ml-5 list-disc text-sm text-gray-700">
                          {masteredIndicators.map((t) => (
                            <li key={t} className="break-inside-avoid">{t}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    baik.length > 0 && (
                      <p className="mb-2 text-sm text-green-700">
                        <span className="font-medium">✅ Mastered:</span>{" "}
                        <span className="text-gray-700">
                          {baik.length} of {items.length} questions answered fully correctly.
                        </span>
                      </p>
                    )
                  )}

                  {penguatan.length > 0 && (
                    <div className="mb-2">
                      <p className="text-sm font-medium text-amber-700">⚠️ Needs Reinforcement:</p>
                      <NeedsList items={penguatan} useIndicators={useIndicators} counts={indicatorCounts} />
                    </div>
                  )}

                  {kurang.length > 0 && (
                    <div className="mb-2">
                      <p className="text-sm font-medium text-red-700">❌ Needs More Understanding:</p>
                      <NeedsList items={kurang} useIndicators={useIndicators} counts={indicatorCounts} />
                    </div>
                  )}
                </div>
              );
            })}

            {indicatorMap.length > 0 && (
              <div className="mt-6 break-inside-avoid border-t border-gray-200 pt-3 text-[11px] leading-snug text-gray-600">
                <p className="mb-1 font-semibold text-gray-700">
                  Indicator Map — which questions assess each indicator
                </p>
                {indicatorMap.map((m) => (
                  <div key={m.subject} className="mb-1.5 break-inside-avoid">
                    <p className="font-medium text-gray-700">{m.subject}</p>
                    <ul className="ml-4 list-disc">
                      {m.entries.map((e, idx) => (
                        <li key={idx}>
                          {e.indicator} <span className="text-gray-500">— Questions {e.questions}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
