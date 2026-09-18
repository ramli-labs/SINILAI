import { createClient } from "@/lib/supabase/server";
import PhotoUpload from "@/components/PhotoUpload";

export default async function UploadPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const supabase = await createClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, class_id")
    .eq("id", examId)
    .single();

  const { data: students } = await supabase
    .from("students")
    .select("id, roll_number, full_name")
    .eq("class_id", exam?.class_id)
    .order("roll_number");

  return (
    <div className="max-w-md">
      <h1 className="mb-1 text-lg font-semibold">Upload Foto Jawaban</h1>
      <p className="mb-4 text-sm text-gray-500">{exam?.title}</p>

      <PhotoUpload examId={examId} students={students ?? []} />
    </div>
  );
}
