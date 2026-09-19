import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeleteExamButton from "@/components/DeleteExamButton";

async function deleteExamAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const examId = formData.get("examId") as string;

  const { data: exam } = await supabase
    .from("exams")
    .select("class_id")
    .eq("id", examId)
    .single();

  const { error } = await supabase.from("exams").delete().eq("id", examId);
  if (error) throw new Error(error.message);

  redirect(exam?.class_id ? `/classes/${exam.class_id}` : "/classes");
}

export default async function ExamDetailPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const supabase = await createClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, exam_date, total_marks, class_id, subjects(name)")
    .eq("id", examId)
    .single();

  const { data: questions } = await supabase
    .from("questions")
    .select("id, question_number, max_marks")
    .eq("exam_id", examId)
    .order("order_index");

  const { data: submissions } = await supabase
    .from("submissions")
    .select("id, status")
    .eq("exam_id", examId);

  const statusCounts = (submissions ?? []).reduce(
    (acc: Record<string, number>, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div>
      <div className="mb-1 flex items-start justify-between">
        <h1 className="text-lg font-semibold">{exam?.title}</h1>
        <DeleteExamButton
          examId={examId}
          examTitle={exam?.title ?? ""}
          deleteAction={deleteExamAction}
        />
      </div>
      <p className="mb-4 text-sm text-gray-500">
        {(exam as any)?.subjects?.name} · Total {exam?.total_marks} poin ·{" "}
        {exam?.exam_date ?? "belum dijadwalkan"}
      </p>

      <div className="mb-6 flex gap-3">
        <a href={`/exams/${examId}/upload`} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Upload Foto Jawaban
        </a>
        <a href={`/exams/${examId}/review`} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50">
          Review Nilai
        </a>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            Soal ({questions?.length ?? 0})
          </h2>
          <div className="space-y-1 text-sm">
            {questions?.map((q) => (
              <div
                key={q.id}
                className="flex justify-between rounded-md border border-gray-200 bg-white px-3 py-1.5"
              >
                <span>{q.question_number}</span>
                <span className="text-gray-500">{q.max_marks} poin</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            Status Pengumpulan
          </h2>
          <ul className="space-y-1 text-sm text-gray-600">
            <li>Menunggu upload: {statusCounts.pending ?? 0}</li>
            <li>Diproses: {statusCounts.processing ?? 0}</li>
            <li>Sudah dinilai AI: {statusCounts.processed ?? 0}</li>
            <li>Sudah direview guru: {statusCounts.reviewed ?? 0}</li>
            <li>Error: {statusCounts.error ?? 0}</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
