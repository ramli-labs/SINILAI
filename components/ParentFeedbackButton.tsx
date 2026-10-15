"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Toast from "@/components/Toast";
import { setBulkLock } from "@/lib/bulkLock";

// Ubah deskripsi lama menjadi versi ramah orang tua ("The student ...").
// 15 deskripsi per permintaan, 3 permintaan sekaligus, coba ulang otomatis.
const BATCH = 15;
const CONCURRENCY = 3;
const MAX_TRIES = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runBatch(ids: string[]): Promise<{ updated: number; error?: string }> {
  let lastError = "Gagal";
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const res = await fetch("/api/parent-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score_ids: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { updated: data.updated ?? 0 };
      lastError = data.error ?? `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) return { updated: 0, error: lastError };
    } catch (e: any) {
      lastError = e?.message ?? "Koneksi terputus";
    }
    if (attempt < MAX_TRIES) await sleep(2000 * attempt + Math.random() * 1000);
  }
  return { updated: 0, error: lastError };
}

export default function ParentFeedbackButton({ scoreIds }: { scoreIds: string[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [result, setResult] = useState<{ ok: number; failedBatches: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

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
        `Ubah ${scoreIds.length} deskripsi menjadi versi ramah orang tua ("The student ...")?\n\nIsi deskripsi tetap sama, hanya bahasanya. Selama proses berjalan, tombol Simpan dikunci.`
      )
    )
      return;

    const batches: string[][] = [];
    for (let i = 0; i < scoreIds.length; i += BATCH) batches.push(scoreIds.slice(i, i + BATCH));

    setTotal(scoreIds.length);
    setDone(0);
    setResult(null);
    setErrors([]);
    setRunning(true);
    setBulkLock(true);

    let ok = 0;
    let failedBatches = 0;
    const errs: string[] = [];
    let next = 0;

    async function worker() {
      while (next < batches.length) {
        const b = batches[next++];
        const r = await runBatch(b);
        ok += r.updated;
        if (r.error) {
          failedBatches++;
          errs.push(r.error);
        }
        setDone((n) => n + b.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));

    setRunning(false);
    setBulkLock(false);
    setResult({ ok, failedBatches });
    setErrors(Array.from(new Set(errs)).slice(0, 3));
    if (ok > 0) router.refresh();
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <>
      {result && (
        <Toast
          tone={result.failedBatches > 0 ? "error" : "success"}
          message={
            result.failedBatches > 0
              ? `${result.ok} deskripsi diperbarui, sebagian gagal. Klik tombol lagi untuk mengulang sisanya.`
              : `✓ ${result.ok} deskripsi ramah orang tua tersimpan.`
          }
          durationMs={6000}
        />
      )}
      <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          {scoreIds.length > 0 || running ? (
            <>
              <span className="text-violet-900">
                {running ? (
                  <>
                    Mengubah deskripsi… <b>{done}</b> dari <b>{total}</b>. Jangan tutup tab ini;
                    tombol Simpan dikunci sampai selesai.
                  </>
                ) : (
                  <>
                    Ada <b>{scoreIds.length}</b> deskripsi yang belum dalam versi ramah orang tua
                    ("The student …").
                  </>
                )}
              </span>
              {!running && (
                <button
                  type="button"
                  onClick={runAll}
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
                >
                  👪 Buat deskripsi ramah orang tua
                </button>
              )}
            </>
          ) : (
            <span className="text-green-800">✓ Semua deskripsi sudah versi ramah orang tua.</span>
          )}
        </div>
        {running && (
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-violet-100">
            <div className="h-full bg-violet-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
        {!running && errors.length > 0 && (
          <div className="mt-2 rounded border border-red-200 bg-white p-2 text-xs text-red-700">
            <p className="mb-1 font-medium">Alasan gagal:</p>
            <ul className="ml-4 list-disc space-y-0.5">
              {errors.map((e, i) => (
                <li key={i} className="break-words">{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
