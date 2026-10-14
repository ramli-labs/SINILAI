"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Buat deskripsi AI untuk semua soal yang nilainya diubah guru
// tapi belum punya deskripsi versi guru. Diproses satu per satu.
export default function RewriteAllButton({ scoreIds }: { scoreIds: string[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);

  if (scoreIds.length === 0) return null;

  async function runAll() {
    if (
      !confirm(
        `Buat deskripsi AI untuk ${scoreIds.length} soal yang nilainya diubah guru? Setelah selesai, cek sekilas dan edit bila perlu.`
      )
    )
      return;
    setRunning(true);
    setDone(0);
    setFailed(0);
    for (const id of scoreIds) {
      try {
        const res = await fetch("/api/rewrite-reasoning", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score_id: id }),
        });
        if (!res.ok) setFailed((n) => n + 1);
      } catch {
        setFailed((n) => n + 1);
      }
      setDone((n) => n + 1);
    }
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
      <span className="text-blue-900">
        Ada <b>{scoreIds.length}</b> soal yang nilainya diubah guru tapi deskripsinya
        belum disesuaikan.
      </span>
      <button
        type="button"
        onClick={runAll}
        disabled={running}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {running
          ? `Memproses ${done}/${scoreIds.length}...`
          : "✨ Perbarui semua deskripsi"}
      </button>
      {!running && failed > 0 && (
        <span className="text-red-600">{failed} gagal — coba klik lagi.</span>
      )}
    </div>
  );
}
