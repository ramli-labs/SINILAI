"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Toast from "@/components/Toast";

// Buat deskripsi AI untuk semua soal yang nilainya diubah guru
// tapi belum punya deskripsi versi guru. Diproses satu per satu.
export default function RewriteAllButton({ scoreIds }: { scoreIds: string[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);

  if (scoreIds.length === 0 && !running && !result) return null;

  async function runAll() {
    if (
      !confirm(
        `Buat deskripsi AI untuk ${scoreIds.length} soal yang nilainya diubah guru? Setelah selesai, cek sekilas dan edit bila perlu.`
      )
    )
      return;
    const total = scoreIds.length;
    setRunning(true);
    setDone(0);
    setResult(null);
    let ok = 0;
    let failed = 0;
    for (const id of scoreIds) {
      try {
        const res = await fetch("/api/rewrite-reasoning", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score_id: id }),
        });
        if (res.ok) ok++;
        else failed++;
      } catch {
        failed++;
      }
      setDone((n) => n + 1);
    }
    setRunning(false);
    setResult({ ok, failed });
    if (ok > 0) router.refresh();
    void total;
  }

  return (
    <>
      {result && (
        <Toast
          tone={result.failed > 0 ? "error" : "success"}
          message={
            result.failed > 0
              ? `${result.ok} deskripsi berhasil dibuat, ${result.failed} gagal. Klik tombol lagi untuk mengulang yang gagal.`
              : `✓ ${result.ok} deskripsi berhasil dibuat dan tersimpan.`
          }
          durationMs={6000}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
        {scoreIds.length > 0 || running ? (
          <>
            <span className="text-blue-900">
              Ada <b>{scoreIds.length}</b> soal yang nilainya diubah guru tapi
              deskripsinya belum disesuaikan.
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
          </>
        ) : (
          <span className="text-green-800">
            ✓ Semua deskripsi untuk nilai yang diubah guru sudah disesuaikan.
          </span>
        )}
        {!running && result && result.failed > 0 && (
          <span className="text-red-600">{result.failed} gagal — klik lagi untuk mengulang.</span>
        )}
      </div>
    </>
  );
}
