"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Toast from "@/components/Toast";
import { setBulkLock } from "@/lib/bulkLock";

// Buat deskripsi AI untuk semua soal yang nilainya diubah guru
// tapi belum punya deskripsi versi guru.
// - Dikerjakan 4 sekaligus (biaya sama, hanya lebih cepat).
// - Bila ditolak karena batas kecepatan API, dicoba ulang otomatis.
// - Tiap hasil langsung tersimpan di server.
// - Selama berjalan, tombol Simpan di halaman dikunci.
const CONCURRENCY = 4;
const MAX_TRIES = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rewriteOne(id: string): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const res = await fetch("/api/rewrite-reasoning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score_id: id }),
      });
      if (res.ok) return true;
      // Hanya ulangi untuk batas kecepatan / gangguan server
      if (res.status !== 429 && res.status < 500) return false;
    } catch {
      // koneksi putus sesaat — coba lagi
    }
    if (attempt < MAX_TRIES) await sleep(2000 * attempt + Math.random() * 1000);
  }
  return false;
}

export default function RewriteAllButton({ scoreIds }: { scoreIds: string[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);

  // Peringatan bila tab ditutup saat proses berjalan; buka kunci bila komponen hilang
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);
  useEffect(() => () => setBulkLock(false), []);

  if (scoreIds.length === 0 && !running && !result) return null;

  async function runAll() {
    if (
      !confirm(
        `Buat deskripsi AI untuk ${scoreIds.length} soal yang nilainya diubah guru?\n\nSelama proses berjalan, tombol Simpan dikunci. Setelah selesai, cek sekilas dan edit bila perlu.`
      )
    )
      return;

    const ids = [...scoreIds];
    setTotal(ids.length);
    setRunning(true);
    setBulkLock(true);
    setDone(0);
    setResult(null);

    let ok = 0;
    let failed = 0;
    let next = 0;

    async function worker() {
      while (next < ids.length) {
        const id = ids[next++];
        if (await rewriteOne(id)) ok++;
        else failed++;
        setDone((n) => n + 1);
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));

    setRunning(false);
    setBulkLock(false);
    setResult({ ok, failed });
    if (ok > 0) router.refresh();
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

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

      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          {scoreIds.length > 0 || running ? (
            <>
              <span className="text-blue-900">
                {running ? (
                  <>
                    Membuat deskripsi… <b>{done}</b> dari <b>{total}</b> selesai. Jangan
                    tutup tab ini; tombol Simpan dikunci sampai selesai.
                  </>
                ) : (
                  <>
                    Ada <b>{scoreIds.length}</b> soal yang nilainya diubah guru tapi
                    deskripsinya belum disesuaikan.
                  </>
                )}
              </span>
              {!running && (
                <button
                  type="button"
                  onClick={runAll}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  ✨ Perbarui semua deskripsi
                </button>
              )}
            </>
          ) : (
            <span className="text-green-800">
              ✓ Semua deskripsi untuk nilai yang diubah guru sudah disesuaikan.
            </span>
          )}
          {!running && result && result.failed > 0 && (
            <span className="text-red-600">
              {result.failed} gagal — klik lagi untuk mengulang.
            </span>
          )}
        </div>
        {running && (
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-blue-100">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </>
  );
}
