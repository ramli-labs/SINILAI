import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, students(count), exams(count)");

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Ringkasan</h1>

      {(!classes || classes.length === 0) && (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Belum ada kelas.{" "}
          <a href="/classes/new" className="text-blue-600 hover:underline">
            Buat kelas pertama Bapak/Ibu
          </a>
          .
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {classes?.map((c: any) => (
          <a
            key={c.id}
            href={`/classes/${c.id}`}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-300"
          >
            <p className="font-medium">{c.name}</p>
            <p className="text-sm text-gray-500">
              {c.students?.[0]?.count ?? 0} siswa · {c.exams?.[0]?.count ?? 0} ujian
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
