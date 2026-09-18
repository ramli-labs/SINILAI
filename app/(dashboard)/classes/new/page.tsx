import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function createClassAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const className = formData.get("className") as string;
  const rosterText = formData.get("roster") as string;

  const { data: newClass, error } = await supabase
    .from("classes")
    .insert({ name: className, owner_teacher_id: user.id })
    .select("id")
    .single();

  if (error || !newClass) {
    throw new Error(error?.message ?? "Gagal membuat kelas");
  }

  // Parse roster: satu baris per siswa, format "Nama<TAB atau spasi ganda>L/P"
  // Urutan baris = nomor absen (1, 2, 3, ...), sesuai kesepakatan.
  const lines = rosterText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const students = lines.map((line, index) => {
    const match = line.match(/^(.*?)[\t]+([LP])$/i) ??
      line.match(/^(.*?)\s{2,}([LP])$/i) ??
      line.match(/^(.*?)\s+([LP])$/i);

    const name = match ? match[1].trim() : line.trim();
    const gender = match ? match[2].toUpperCase() : null;

    return {
      class_id: newClass.id,
      roll_number: index + 1,
      full_name: name,
      gender,
    };
  });

  if (students.length > 0) {
    const { error: studentsError } = await supabase
      .from("students")
      .insert(students);
    if (studentsError) throw new Error(studentsError.message);
  }

  redirect(`/classes/${newClass.id}`);
}

export default function NewClassPage() {
  return (
    <div className="max-w-lg">
      <h1 className="mb-4 text-lg font-semibold">Kelas Baru</h1>

      <form action={createClassAction} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Nama Kelas</label>
          <input
            name="className"
            required
            placeholder="contoh: 7A Cambridge"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Daftar Siswa
          </label>
          <p className="mb-2 text-xs text-gray-500">
            Tempel daftar siswa, satu baris per siswa, format: Nama diikuti
            L/P. Urutan baris otomatis jadi nomor absen.
          </p>
          <textarea
            name="roster"
            required
            rows={12}
            placeholder={"Adzra Balqis Syakira Swandana\tP\nAidan Zhafran Maheswara\tL"}
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Buat Kelas
        </button>
      </form>
    </div>
  );
}
