import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeleteClassButton from "@/components/DeleteClassButton";

async function deleteClassAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const classId = formData.get("classId") as string;

  const { error } = await supabase.from("classes").delete().eq("id", classId);
  if (error) throw new Error(error.message);

  redirect("/classes");
}

export default async function ClassDetailPage({
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

  const { data: students } = await supabase
    .from("students")
    .select("id, roll_number, full_name, gender")
    .eq("class_id", classId)
    .order("roll_number");

  const { data: exams } = await supabase
    .from("exams")
    .select("id, title, exam_date, subjects(name)")
    .eq("class_id", classId)
    .order("exam_date", { ascending: false });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">{classData?.name}</h1>
        <div className="flex gap-2">
          <a href={`/exams/new?classId=${classId}`} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
            + Ujian Baru
          </a>
          <a href={`/classes/${classId}/parent-report`} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
            Laporan Orang Tua
          </a>
          <a href={`/classes/${classId}/teachers`} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
            Kelola Guru
          </a>
          <DeleteClassButton
            classId={classId}
            className={classData?.name ?? ""}
            studentCount={students?.length ?? 0}
            examCount={exams?.length ?? 0}
            deleteAction={deleteClassAction}
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            Ujian ({exams?.length ?? 0})
          </h2>
          <div className="space-y-2">
            {exams?.map((e: any) => (
              <a key={e.id} href={`/exams/${e.id}`} className="block rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-sm hover:border-blue-300">
                <p className="font-medium">{e.title}</p>
                <p className="text-gray-500">
                  {e.subjects?.name} · {e.exam_date ?? "belum dijadwalkan"}
                </p>
              </a>
            ))}
            {(!exams || exams.length === 0) && (
              <p className="text-sm text-gray-400">Belum ada ujian.</p>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            Daftar Siswa ({students?.length ?? 0})
          </h2>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">No.</th>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">L/P</th>
                </tr>
              </thead>
              <tbody>
                {students?.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5">{s.roll_number}</td>
                    <td className="px-3 py-1.5">{s.full_name}</td>
                    <td className="px-3 py-1.5">{s.gender}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
