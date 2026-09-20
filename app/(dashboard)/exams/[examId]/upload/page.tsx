import { createClient } from "@/lib/supabase/server";
import UploadModeTabs from "@/components/UploadModeTabs";

export default async function UploadPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const supabase = await createClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, class_id, pages_per_submission")
    .eq("id", examId)
    .single();

  const { data: students } = await supabase
    .from("students")
    .select("id, roll_number, full_name")
    .eq("class_id", exam?.class_id)
    .order("roll_number");

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-lg font-semibold">Upload Foto Jawaban</h1>
      <p className="mb-4 text-sm text-gray-500">
        {exam?.title} · {exam?.pages_per_submission ?? 1} halaman per siswa
      </p>

      <UploadModeTabs
        examId={examId}
        students={students ?? []}
        pagesPerSubmission={exam?.pages_per_submission ?? 1}
      />
    </div>
  );
}
