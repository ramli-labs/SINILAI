// lib/roles.ts
// Peran pengguna: teacher (guru), admin, super_admin.
// - admin/super_admin: lihat & ubah semua kelas, kelola akun guru, ubah model AI
// - super_admin: juga mengangkat/menurunkan admin

import { createClient as createServiceClient } from "@supabase/supabase-js";

export type Role = "teacher" | "admin" | "super_admin";

export interface CurrentTeacher {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
}

export const isAdminRole = (r?: string | null) => r === "admin" || r === "super_admin";

export const ROLE_LABEL: Record<Role, string> = {
  teacher: "Guru",
  admin: "Admin",
  super_admin: "Super Admin",
};

export function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Data guru yang sedang login (dibaca dengan service role supaya selalu terbaca)
export async function getCurrentTeacher(userId: string): Promise<CurrentTeacher | null> {
  const { data } = await serviceClient()
    .from("teachers")
    .select("id, full_name, email, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    role: (data.role ?? "teacher") as Role,
    is_active: data.is_active !== false,
  } as CurrentTeacher;
}

// Apakah `actor` boleh mengelola akun `targetRole`?
// super_admin → siapa saja; admin → hanya guru biasa.
export function canManage(actor: Role, targetRole: Role): boolean {
  if (actor === "super_admin") return true;
  if (actor === "admin") return targetRole === "teacher";
  return false;
}
