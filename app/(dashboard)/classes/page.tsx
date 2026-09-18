import { createClient } from "@/lib/supabase/server";

export default async function ClassesPage() {
  const supabase = await createClient();
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, students(count)");

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Kelas</h1>
        <a
          href="/classes/new"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          + Kelas Baru
        </a>
      </div>

      <div className="space-y-2">
        {classes?.map((c: any) => (
          <a
            key={c.id}
            href={`/classes/${c.id}`}
            className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-300"
          >
            <p className="font-medium">{c.name}</p>
            <p className="text-sm text-gray-500">
              {c.students?.[0]?.count ?? 0} siswa
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
