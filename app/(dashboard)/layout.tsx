import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import LogoutButton from "@/components/LogoutButton";
import NoticeToast from "@/components/NoticeToast";
import { getCurrentTeacher, isAdminRole, ROLE_LABEL } from "@/lib/roles";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const teacher = await getCurrentTeacher(user.id);
  if (teacher && !teacher.is_active) {
    await supabase.auth.signOut();
    redirect("/login?inactive=1");
  }
  const admin = isAdminRole(teacher?.role);

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <a href="/dashboard" className="font-semibold">
            Koreksi Ujian AI
          </a>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/classes" className="text-gray-600 hover:text-gray-900">
              Kelas
            </a>
            {admin && (
              <>
                <a href="/admin/teachers" className="text-gray-600 hover:text-gray-900">
                  Kelola Guru
                </a>
                <a href="/settings/models" className="text-gray-600 hover:text-gray-900">
                  Model AI
                </a>
              </>
            )}
            <span className="text-gray-400">
              {teacher?.full_name ?? user.email}
              {admin && teacher && (
                <span className="ml-1 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                  {ROLE_LABEL[teacher.role]}
                </span>
              )}
            </span>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 print:max-w-none print:p-0">{children}</main>
      <Suspense fallback={null}>
        <NoticeToast />
      </Suspense>
    </div>
  );
}
