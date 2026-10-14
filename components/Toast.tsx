"use client";

import { useEffect, useState } from "react";

// Notifikasi kecil di pojok kanan bawah, hilang sendiri setelah beberapa detik.
// clearParam: nama query param yang dihapus dari URL setelah tampil,
// supaya notifikasi tidak muncul lagi saat halaman di-refresh.
export default function Toast({
  message,
  tone = "success",
  durationMs = 4500,
  clearParam,
}: {
  message: string;
  tone?: "success" | "error" | "info";
  durationMs?: number;
  clearParam?: string;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), durationMs);
    if (clearParam) {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has(clearParam)) {
          url.searchParams.delete(clearParam);
          window.history.replaceState(null, "", url.toString());
        }
      } catch {
        // abaikan
      }
    }
    return () => clearTimeout(t);
  }, [message, durationMs, clearParam]);

  if (!visible) return null;

  const color =
    tone === "success"
      ? "border-green-300 bg-green-50 text-green-800"
      : tone === "error"
      ? "border-red-300 bg-red-50 text-red-800"
      : "border-blue-300 bg-blue-50 text-blue-800";

  return (
    <div
      role="status"
      className={`fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg print:hidden ${color}`}
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="opacity-60 hover:opacity-100"
        aria-label="Tutup"
      >
        ✕
      </button>
    </div>
  );
}
