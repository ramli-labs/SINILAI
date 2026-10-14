"use client";

import { useSearchParams } from "next/navigation";
import Toast from "@/components/Toast";

// Notifikasi umum setelah simpan/hapus. Server action cukup redirect ke
// halaman tujuan dengan ?notice=<kode>, misalnya /exams/123?notice=exam_saved
const MESSAGES: Record<string, { text: string; tone?: "success" | "error" | "info" }> = {
  exam_created: { text: "✓ Ujian berhasil dibuat." },
  exam_saved: { text: "✓ Perubahan ujian tersimpan." },
  exam_deleted: { text: "✓ Ujian dihapus." },
  class_created: { text: "✓ Kelas berhasil dibuat." },
  class_deleted: { text: "✓ Kelas dihapus." },
  teacher_added: { text: "✓ Akses guru tersimpan." },
  teacher_removed: { text: "✓ Akses guru dihapus." },
  password_reset: { text: "✓ Password guru berhasil direset." },
  models_saved: { text: "✓ Pengaturan model AI tersimpan." },
};

export default function NoticeToast() {
  const params = useSearchParams();
  const code = params.get("notice");
  const msg = code ? MESSAGES[code] : null;
  if (!msg) return null;
  return <Toast key={code} message={msg.text} tone={msg.tone} clearParam="notice" />;
}
