import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import SubmitButton from "@/components/SubmitButton";

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function addTeacherAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const classId = formData.get("classId") as string;
  const subjectId = formData.get("subjectId") as string;
  const fullName = formData.get("fullName") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const svc = serviceClient();

  const { data: existingTeacher } = await svc
    .from("teachers")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let teacherId: string;

  if (existingTeacher) {
    teacherId = existingTeacher.id;
  } else {
    const { data: newUser, error: createError } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError || !newUser.user) {
      throw new Error(createError?.message ?? "Gagal membuat akun guru");
    }

    const { error: teacherInsertError } = await svc.from("teachers").insert({
      id: newUser.user.id,
      full_name: fullName,
      email,
    });
    if (teacherInsertError) throw new Error(teacherInsertError.message);

    teacherId = newUser.user.id;
  }

  const { error: accessError } = await svc
    .from("class_teachers")
    .upsert(
      { class_id: classId, teacher_id: teacherId, subject_id: subjectId },
      { onConflict: "class_id,teacher_id,subject_id" }
    );
  if (accessError) throw new Error(accessError.message);

  redirect(`/classes/${classId}/teachers`);
}

async function removeAccessAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const classId = formData.get("classId") as string;
  const teacherId = formData.get("teacherId") as string;
  const subjectId = formData.get("subjectId") as string;

  const svc = serviceClient();
  await svc
    .from("class_teachers")
    .delete()
    .eq("class_id", classId)
    .eq("teacher_id", teacherId)
    .eq("subject_id", subjectId);

  redirect(`/classes/${classId}/teachers`);
}

export default async function ClassTeachersPage({
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

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name")
    .order("name");

  const svc = serviceClient();
  const { data: access } = await svc
    .from("class_teachers")
    .select("teacher_id, subject_id, teachers(full_name, email), subjects(name)")
    .eq("class_id", classId);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-lg font-semibold">Kelola Guru — {classData.name}</h1>
      <p className="mb-4 text-sm text-gray-500">
        Guru yang ditambahkan hanya bisa kelola ujian untuk mapel yang
        diberikan, bukan seluruh kelas.
      </p>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">
          Guru dengan Akses
        </h2>
        {(!access || access.length === 0) && (
          <p className="text-sm text-gray-400">Belum ada guru lain ditambahkan.</p>
        )}
        <div className="space-y-2">
          {access?.map((a: any) => (
            <div
              key={`${a.teacher_id}-${a.subject_id}`}
              className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{a.teachers?.full_name}</p>
                <p className="text-gray-500">
                  {a.teachers?.email} · {a.subjects?.name}
                </p>
              </div>
              <form action={removeAccessAction}>
                <input type="hidden" name="classId" value={classId} />
                <input type="hidden" name="teacherId" value={a.teacher_id} />
                <input type="hidden" name="subjectId" value={a.subject_id} />
                <button
                  type="submit"
                  className="text-xs text-red-600 hover:underline"
                >
                  Hapus akses
                </button>
              </form>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Tambah Guru Baru
        </h2>
        <p className="mb-3 text-xs text-gray-500">
          Kalau email ini sudah pernah didaftarkan sebelumnya (untuk mapel/kelas
          lain), sistem otomatis pakai akun yang sama — tidak buat akun baru.
        </p>
        <form action={addTeacherAction} className="space-y-3">
          <input type="hidden" name="classId" value={classId} />

          <div>
            <label className="mb-1 block text-sm font-medium">Nama Lengkap</label>
            <input
              name="fullName"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              type="email"
              name="email"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Password Awal (beri tahu ke guru terkait setelah dibuat)
            </label>
            <input
              type="text"
              name="password"
              required
              minLength={6}
              placeholder="Minimal 6 karakter"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Kalau email sudah punya akun, kolom ini diabaikan.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Akses Mapel (hanya mapel ini yang bisa dikelola)
            </label>
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

          <SubmitButton pendingText="Menambahkan...">Tambah Guru</SubmitButton>
        </form>
      </div>
    </div>
  );
}
