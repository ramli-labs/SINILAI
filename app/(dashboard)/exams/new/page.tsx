import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function createExamAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const classId = formData.get("classId") as string;
  const subjectId = formData.get("subjectId") as string;
  const title = formData.get("title") as string;
  const examDate = formData.get("examDate") as string;
  const questionsRaw = formData.get("questionsRaw") as string;

  // Format input soal + mark scheme:
  // Q: <nomor soal> | <max marks> | <teks soal opsional>
  // MS: <kode> | <poin> | <deskripsi jawaban diterima>
  // (baris MS berikutnya masih milik Q terakhir di atasnya)
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

  const { data: exam, error } = await supabase
    .from("exams")
    .insert({
      class_id: classId,
      subject_id: subjectId,
      title,
      exam_date: examDate || null,
      total_marks: totalMarks,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !exam) throw new Error(error?.message ?? "Gagal membuat ujian");

  for (let i = 0; i < parsedQuestions.length; i++) {
    const pq = parsedQuestions[i];
    const { data: question, error: qError } = await supabase
      .from("questions")
      .insert({
        exam_id: exam.id,
        question_number: pq.number,
        question_text: pq.text,
        max_marks: pq.maxMarks,
        order_index: i,
      })
      .select("id")
      .single();

    if (qError || !question) throw new Error(qError?.message ?? "Gagal simpan soal");

    if (pq.markScheme.length > 0) {
      const { error: msError } = await supabase.from("mark_scheme_items").insert(
        pq.markScheme.map((m, idx) => ({
          question_id: question.id,
          mark_code: m.code,
          points: m.points,
          accepted_answers: m.description,
          order_index: idx,
        }))
      );
      if (msError) throw new Error(msError.message);
    }
  }

  redirect(`/exams/${exam.id}`);
}

export default async function NewExamPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const { classId } = await searchParams;
  const supabase = await createClient();

  const { data: classes } = await supabase.from("classes").select("id, name");
  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name")
    .order("name");

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-lg font-semibold">Ujian Baru</h1>

      <form action={createExamAction} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Kelas</label>
            <select
              name="classId"
              defaultValue={classId}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {classes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Mapel</label>
            <select
              name="subjectId"
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
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Judul Ujian</label>
          <input
            name="title"
            required
            placeholder="Mid Term 1 Physics"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Tanggal Ujian</label>
          <input
            type="date"
            name="examDate"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Soal &amp; Mark Scheme
          </label>
          <p className="mb-2 text-xs text-gray-500">
            Format: baris <code>Q: nomor | max poin | teks soal (opsional)</code>{" "}
            diikuti satu atau lebih baris{" "}
            <code>MS: kode | poin | jawaban diterima</code>.
          </p>
          <textarea
            name="questionsRaw"
            required
            rows={16}
            placeholder={
              "Q: 1(a) | 1 | State the equation linking density, mass and volume\n" +
              "MS: B1 | 1 | density = mass/volume\n\n" +
              "Q: 1(b) | 3 | Calculate the volume of the steel cube\n" +
              "MS: C1 | 1 | uses volume = mass/density\n" +
              "MS: C2 | 1 | correct substitution 110/7900\n" +
              "MS: A3 | 1 | 0.014 m3 (accept 0.0139-0.014)"
            }
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Simpan Ujian
        </button>
      </form>
    </div>
  );
}
