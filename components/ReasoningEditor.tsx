"use client";

import { useState } from "react";

// Kotak deskripsi untuk soal yang nilainya diubah guru.
// Isinya dikirim bersama form "Simpan" (name="reasoning-<scoreId>").
export default function ReasoningEditor({
  scoreId,
  initialValue,
}: {
  scoreId: string;
  initialValue: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rewrite-reasoning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score_id: scoreId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal membuat deskripsi");
      setValue(data.teacher_reasoning);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-1.5 rounded-md border border-blue-200 bg-blue-50 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-blue-800">
          Deskripsi untuk Laporan Orang Tua
        </span>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rounded border border-blue-300 bg-white px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100 disabled:opacity-50"
        >
          {loading ? "Membuat..." : "✨ Buat ulang dengan AI"}
        </button>
      </div>
      <textarea
        name={`reasoning-${scoreId}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="Belum ada. Klik ✨ untuk membuat draf, atau ketik sendiri."
        className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
      />
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
