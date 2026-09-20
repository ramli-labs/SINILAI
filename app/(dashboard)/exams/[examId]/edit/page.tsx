import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExamQuestionsInput from "@/components/ExamQuestionsInput";
import SubmitButton from "@/components/SubmitButton";

async function updateExamAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const examId = formData.get("examId") as string;
  const subjectId = formData.get("subjectId") as string;
  const title = formData.get("title") as string;
  const examDate = formData.get("examDate") as string;
  const questionsRaw = formData.get("questionsRaw") as string;

  const lines = questionsRaw.split("\n").map((l) => l.trim());

  type ParsedQuestion = {
    number: string;
    maxMarks: number;
    text: string | null;
    markScheme: { code: string; points: number; description: string }[];
  };

  const parsedQuestions: ParsedQuestion[] = [];

  for (const line of lines) {
    if (!line) continue;

    if (line.startsWith("Q:")) {
      const parts = line.slice(2).split("|").map((p) => p.trim());
      parsedQuestions.push({
        number: parts[0] ?? "",
        maxMarks: parseInt(parts[1] ?? "0", 10) || 0,
        text: parts[2] || null,
        markScheme: [],
      });
    } else if (line.startsWith("MS:")) {
      const current = parsedQuestions[parsedQuestions.length - 1];
      if (!current) continue;
      const parts = line.slice(3).split("|").map((p) => p.trim());
      current.markScheme.push({
        code: parts[0] ?? "",
        points: parseInt(parts[1] ?? "1", 10) || 1,
        description: parts[2] ?? "",
      });
    }
  }

  const totalMarks = parsedQuestions.reduce((sum, q) => sum + q.maxMarks, 0);

  const { error: examError } = await supabase
    .from("exams")
    .update({
      subject_id: subjectId,
      title,
      exam_date: examDate || null,
      total_marks: totalMarks,
    })
    .eq("id", examId);
  if (examError) throw new Error(examError.message);

  const { data: existingQuestions } = await supabase
    .from("questions")
    .select("id, question_number")
    .eq("exam_id", examId);

  const existingByNumber = new Map(
    (existingQuestions ?? []).map((q) => [q.question_number, q.id])
  );
  const newNumbers = new Set(parsedQuestions.map((q) => q.number));

  for (const eq of existingQuestions ?? []) {
    if (!newNumbers.has(eq.question_number)) {
      await supabase.from("questions").delete().eq("id", eq.id);
    }
  }

  for (let i = 0; i < parsedQuestions.length; i++) {
    const pq = parsedQuestions[i];
    const existingId = existingByNumber.get(pq.number);

    let questionId: string;

    if (existingId) {
      const { error: updateError } = await supabase
        .from("questions")
        .update({
          question_text: pq.text,
          max_marks: pq.maxMarks,
          order_index: i,
        })
        .eq("id", existingId);
      if (updateError) throw new Error(updateError.message);
      questionId = existingId;

      await supabase.from("mark_scheme_items").delete().eq("question_id", questionId);
    } else {
      const { data: newQuestion, error: insertError } = await supabase
        .from("questions")
        .insert({
          exam_id: examId,
          question_number: pq.number,
          question_text: pq.text,
          max_marks: pq.maxMarks,
          order_index: i,
        })
        .select("id")
        .single();
      if (insertError || !newQuestion) throw new Error(insertError?.message ?? "Gagal tambah soal baru");
      questionId = newQuestion.id;
    }

    if (pq.markScheme.length > 0) {
      const { error: msError } = await supabase.from("mark_scheme_items").insert(
        pq.markScheme.map((m, idx) => ({
          question_id: questionId,
          mark_code: m.code,
          points: m.points,
          accepted_answers: m.description,
          order_index: idx,
        }))
      );
      if (msError) throw new Error(msError.message);
    }
  }

  redirect(`/exams/${examId}`);
}

function questionsToRawText(
  questions: { question_number: string; question_text: string | null; max_marks: number; id: string }[],
  markSchemeItems: { question_id: string; mark_code: string | null; points: number; accepted_answers: string }[]
): string {
  return questions
    .map((q) => {
      const items = markSchemeItems.filter((m) => m.question_id === q.id);
      const qLine = `Q: ${q.question_number} | ${q.max_marks} | ${q.question_text ?? ""}`;
      const msLines = items
        .map((m) => `MS: ${m.mark_code ?? "M"} | ${m.points} | ${m.accepted_answers}`)
        .join("\n");
      return `${qLine}\n${msLines}`;
    })
    .join("\n\n");
}

export default async function EditExamPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const supabase = await createClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, exam_date, subject_id, class_id")
    .eq("id", examId)
    .single();

  if (!exam) {
    return <p className="text-sm text-red-600">Ujian tidak ditemukan.</p>;
  }

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name")
    .order("name");

  const { data: questions } = await supabase
    .from("questions")
    .select("id, question_number, question_text, max_marks")
    .eq("exam_id", examId)
    .order("order_index");

  const { data: markSchemeItems } = await supabase
    .from("mark_scheme_items")
    .select("question_id, mark_code, points, accepted_answers")
    .in("question_id", (questions ?? []).map((q) => q.id));

  const initialText = questionsToRawText(questions ?? [], markSchemeItems ?? []);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-lg font-semibold">Edit Ujian</h1>
      <p className="mb-4 text-sm text-amber-700">
        ⚠️ Soal yang nomornya tetap sama akan diperbarui di tempat — nilai
        siswa yang sudah tersimpan untuk soal itu tidak akan hilang. Soal yang
        dihapus dari teks di bawah akan ikut menghapus nilai siswa untuk soal
        itu (kalau ada).
      </p>

      <form action={updateExamAction} className="space-y-4">
        <input type="hidden" name="examId" value={examId} />

        <div>
          <label className="mb-1 block text-sm font-medium">Mapel</label>
          <select
            name="subjectId"
            defaultValue={exam.subject_id}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {subjects?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Judul Ujian</label>
          <input
            name="title"
            required
            defaultValue={exam.title}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Tanggal Ujian</label>
          <input
            type="date"
            name="examDate"
            defaultValue={exam.exam_date ?? ""}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Soal &amp; Mark Scheme
          </label>
          <ExamQuestionsInput initialValue={initialText} initialMode="manual" />
        </div>

        <SubmitButton pendingText="Menyimpan Perubahan...">Simpan Perubahan</SubmitButton>
      </form>
    </div>
  );
}
