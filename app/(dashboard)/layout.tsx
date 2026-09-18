import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";

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

  const { data: teacher } = await supabase
    .from("teachers")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <a href="/dashboard" className="font-semibold">
            Koreksi Ujian AI
          </a>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/classes" className="text-gray-600 hover:text-gray-900">
              Kelas
            </a>
            <span className="text-gray-400">
              {teacher?.full_name ?? user.email}
            </span>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
