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

async function resetPasswordAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const classId = formData.get("classId") as string;
  const teacherId = formData.get("teacherId") as string;
  const newPassword = formData.get("newPassword") as string;

  const svc = serviceClient();
  const { error } = await svc.auth.admin.updateUserById(teacherId, {
    password: newPassword,
  });
  if (error) throw new Error(error.message);

  redirect(`/classes/${classId}/teachers?reset=success`);
}

export default async function ClassTeachersPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ reset?: string }>;
}) {
  const { classId } = await params;
  const { reset } = await searchParams;
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

  const teacherMap = new Map<string, { full_name: string; email: string; subjects: string[] }>();
  for (const a of access ?? []) {
    const t = (a as any).teachers;
    const s = (a as any).subjects;
    if (!t) continue;
    const existing = teacherMap.get(a.teacher_id);
    if (existing) {
      existing.subjects.push(s?.name ?? "");
    } else {
      teacherMap.set(a.teacher_id, {
        full_name: t.full_name,
        email: t.email,
        subjects: [s?.name ?? ""],
      });
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-lg font-semibold">Kelola Guru — {classData.name}</h1>
      <p className="mb-4 text-sm text-gray-500">
        Guru yang ditambahkan hanya bisa kelola ujian untuk mapel yang
        diberikan, bukan seluruh kelas.
      </p>

      {reset === "success" && (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
