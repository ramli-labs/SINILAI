import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";
import Toast from "@/components/Toast";
import {
  getCurrentTeacher,
  isAdminRole,
  canManage,
  serviceClient,
  ROLE_LABEL,
  type Role,
  type CurrentTeacher,
} from "@/lib/roles";

// Hanya admin / super admin
async function requireAdmin(): Promise<CurrentTeacher> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const me = await getCurrentTeacher(user.id);
  if (!me || !me.is_active || !isAdminRole(me.role)) redirect("/classes");
  return me;
}

const back = (msg: string) => redirect(`/admin/teachers?msg=${encodeURIComponent(msg)}`);

async function createTeacherAction(formData: FormData) {
  "use server";
  const me = await requireAdmin();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  let role = (String(formData.get("role") ?? "teacher") as Role) || "teacher";
  if (!canManage(me.role, role)) role = "teacher";

  if (!fullName || !email || password.length < 8) {
    back("Nama, email, dan password (min. 8 karakter) wajib diisi.");
  }

  const svc = serviceClient();
  const { data: existing } = await svc.from("teachers").select("id").eq("email", email).maybeSingle();
  if (existing) back(`Email ${email} sudah terdaftar.`);

  const { data: created, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !created.user) back(`Gagal membuat akun: ${error?.message ?? "?"}`);

  const { error: insErr } = await svc
    .from("teachers")
    .insert({ id: created.user!.id, full_name: fullName, email, role, is_active: true });
  if (insErr) back(`Gagal menyimpan data guru: ${insErr.message}`);

  back(`✓ Akun ${fullName} dibuat.`);
}

async function setRoleAction(formData: FormData) {
  "use server";
  const me = await requireAdmin();
  const id = String(formData.get("id"));
  const newRole = String(formData.get("role")) as Role;
  if (me.role !== "super_admin") back("Hanya Super Admin yang boleh mengubah peran.");
  if (id === me.id) back("Anda tidak bisa mengubah peran akun sendiri.");

  const svc = serviceClient();
  const { error } = await svc.from("teachers").update({ role: newRole }).eq("id", id);
  if (error) back(`Gagal: ${error.message}`);
  back("✓ Peran diperbarui.");
}

async function setActiveAction(formData: FormData) {
  "use server";
  const me = await requireAdmin();
  const id = String(formData.get("id"));
  const active = formData.get("active") === "1";
  if (id === me.id) back("Anda tidak bisa menonaktifkan akun sendiri.");

  const target = await getCurrentTeacher(id);
  if (!target || !canManage(me.role, target.role)) back("Anda tidak berhak mengubah akun ini.");

  const svc = serviceClient();
  // Nonaktif = diblokir dari login (ban) + ditandai di tabel guru
  const { error: banErr } = await svc.auth.admin.updateUserById(id, {
    ban_duration: active ? "none" : "876000h",
  } as any);
  if (banErr) back(`Gagal: ${banErr.message}`);
  await svc.from("teachers").update({ is_active: active }).eq("id", id);
  back(active ? "✓ Akun diaktifkan kembali." : "✓ Akun dinonaktifkan.");
}

async function resetPasswordAction(formData: FormData) {
  "use server";
  const me = await requireAdmin();
  const id = String(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) back("Password baru minimal 8 karakter.");

  const target = await getCurrentTeacher(id);
  if (!target || (id !== me.id && !canManage(me.role, target.role))) {
    back("Anda tidak berhak mereset password akun ini.");
  }
  const { error } = await serviceClient().auth.admin.updateUserById(id, { password });
  if (error) back(`Gagal: ${error.message}`);
  back(`✓ Password ${target!.full_name} direset.`);
}

export default async function AdminTeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const me = await requireAdmin();
  const { msg } = await searchParams;
  const svc = serviceClient();

  const { data: teachers } = await svc
    .from("teachers")
    .select("id, full_name, email, role, is_active, created_at")
    .order("full_name");

  const { data: owned } = await svc.from("classes").select("owner_teacher_id");
  const { data: shared } = await svc.from("class_teachers").select("teacher_id, class_id");
  const classCount = new Map<string, Set<string>>();
  (owned ?? []).forEach((c: any, i: number) => {
    const s = classCount.get(c.owner_teacher_id) ?? new Set();
    s.add(`own-${i}`);
    classCount.set(c.owner_teacher_id, s);
  });
  (shared ?? []).forEach((c: any) => {
    const s = classCount.get(c.teacher_id) ?? new Set();
    s.add(c.class_id);
    classCount.set(c.teacher_id, s);
  });

  const roleOptions: Role[] = me.role === "super_admin" ? ["teacher", "admin", "super_admin"] : ["teacher"];
  const input = "rounded-md border border-gray-300 px-2 py-1 text-sm";

  return (
    <div>
      {msg && <Toast message={msg} tone={msg.startsWith("✓") ? "success" : "error"} clearParam="msg" />}
      <h1 className="mb-1 text-lg font-semibold">Kelola Guru</h1>
      <p className="mb-4 text-sm text-gray-500">
        Admin dapat melihat & mengubah semua kelas, mengelola akun guru, dan mengatur model AI.
        Hanya Super Admin yang dapat mengubah peran.
      </p>

      <form action={createTeacherAction} className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <p className="mb-2 text-sm font-medium">Tambah akun guru</p>
        <div className="flex flex-wrap items-end gap-2">
          <input name="fullName" placeholder="Nama lengkap" required className={`${input} w-56`} />
          <input name="email" type="email" placeholder="Email" required className={`${input} w-56`} />
          <input name="password" type="text" placeholder="Password awal (min. 8)" minLength={8} required className={`${input} w-48`} />
          <select name="role" className={input} defaultValue="teacher">
            {roleOptions.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
          <SubmitButton pendingText="Membuat...">Tambah</SubmitButton>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2">Nama</th>
              <th className="px-3 py-2">Peran</th>
              <th className="px-3 py-2">Kelas</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Reset password</th>
            </tr>
          </thead>
          <tbody>
            {(teachers ?? []).map((t: any) => {
              const role = (t.role ?? "teacher") as Role;
              const self = t.id === me.id;
              const manageable = self || canManage(me.role, role);
              const active = t.is_active !== false;
              return (
                <tr key={t.id} className={"border-t border-gray-100 " + (active ? "" : "bg-gray-50 text-gray-400")}>
                  <td className="px-3 py-2">
                    <p className="font-medium">{t.full_name}{self && " (Anda)"}</p>
                    <p className="text-xs text-gray-500">{t.email}</p>
                  </td>
                  <td className="px-3 py-2">
                    {me.role === "super_admin" && !self ? (
                      <form action={setRoleAction} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={t.id} />
                        <select name="role" defaultValue={role} className={input}>
                          {(["teacher", "admin", "super_admin"] as Role[]).map((r) => (
                            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                          ))}
                        </select>
                        <button className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">Simpan</button>
                      </form>
                    ) : (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{ROLE_LABEL[role]}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{classCount.get(t.id)?.size ?? 0}</td>
                  <td className="px-3 py-2">
                    {!self && manageable ? (
                      <form action={setActiveAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="active" value={active ? "0" : "1"} />
                        <button
                          className={
                            "rounded px-2 py-1 text-xs " +
                            (active
                              ? "border border-red-200 text-red-700 hover:bg-red-50"
                              : "border border-green-300 text-green-700 hover:bg-green-50")
                          }
                        >
                          {active ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs">{active ? "Aktif" : "Nonaktif"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {manageable ? (
                      <form action={resetPasswordAction} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={t.id} />
                        <input name="password" type="text" minLength={8} required placeholder="Password baru" className={`${input} w-36`} />
                        <button className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">Reset</button>
                      </form>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
