"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Student {
  id: string;
  roll_number: number;
  full_name: string;
}

type ItemStatus = "waiting" | "processing" | "matched" | "needs_review" | "error" | "saved";

interface QueueItem {
  files: File[];
  status: ItemStatus;
  studentNameRead?: string;
  matchedStudent?: { id: string; full_name: string; roll_number: number };
  bestGuessId?: string;
  photoUrls?: string[];
  totalScore?: number;
  scores?: any[];
  modelUsed?: string;
  errorMsg?: string;
  selectedStudentId?: string;
}

function naturalCompare(a: string, b: string): number {
  const splitParts = (s: string) => s.match(/(\d+|\D+)/g) ?? [s];
  const partsA = splitParts(a);
  const partsB = splitParts(b);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const pa = partsA[i] ?? "";
    const pb = partsB[i] ?? "";
    const numA = parseInt(pa, 10);
    const numB = parseInt(pb, 10);

    if (!isNaN(numA) && !isNaN(numB)) {
      if (numA !== numB) return numA - numB;
    } else if (pa !== pb) {
      return pa < pb ? -1 : 1;
    }
  }
  return 0;
}

export default function BulkPhotoUpload({
  examId,
  students,
  pagesPerSubmission,
}: {
  examId: string;
  students: Student[];
  pagesPerSubmission: number;
}) {
  const supabase = createClient();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [extracting, setExtracting] = useState(false);

  // Kunci siswa dari nama file: buang ekstensi lalu nomor halaman di akhir.
  // "AISHA MADINAH KHARIS0003.jpg" -> "aisha madinah kharis"
  // "AISHA MADINAH KHARIS.jpg"     -> "aisha madinah kharis"
  // "01_p02.jpg"                   -> "01"
  function studentKey(fileName: string): string {
    return fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[\s_-]*\(?\d+\)?$/, "")
      .replace(/[\s_-]+(?:p|hal|page)[\s_-]*$/i, "")
      .trim()
      .toLowerCase();
  }

  function buildGroups(sortedFiles: File[]) {
    // 1) Kelompokkan berdasarkan nama siswa di nama file
    const byName = new Map<string, File[]>();
    for (const f of sortedFiles) {
      const key = studentKey(f.name);
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(f);
    }
    let groups = Array.from(byName.values());

    // 2) Cadangan: kalau nama file tidak mengandung nama siswa
    //    (misal semua IMG_1234.jpg), potong rata per jumlah halaman.
    const namesUnusable =
      groups.length === 1 && sortedFiles.length > pagesPerSubmission * 1.5;
    if (namesUnusable) {
      groups = [];
      for (let i = 0; i < sortedFiles.length; i += pagesPerSubmission) {
        groups.push(sortedFiles.slice(i, i + pagesPerSubmission));
      }
    }

    setQueue(groups.map((files) => ({ files, status: "waiting" as ItemStatus })));
  }

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const allFiles = Array.from(fileList);

    const isSingleZip =
      allFiles.length === 1 &&
      (allFiles[0].name.toLowerCase().endsWith(".zip") ||
        allFiles[0].type === "application/zip");

    if (isSingleZip) {
      setExtracting(true);
      try {
        const { default: JSZip } = await import("jszip");
        const zip = await JSZip.loadAsync(allFiles[0]);

        const imageEntries = Object.values(zip.files).filter(
          (f) => !f.dir && /\.(jpe?g|png|webp)$/i.test(f.name)
        );

        imageEntries.sort((a, b) => naturalCompare(a.name, b.name));

        const extractedFiles: File[] = [];
        for (const entry of imageEntries) {
          const blob = await entry.async("blob");
          const fileName = entry.name.split("/").pop() ?? entry.name;
          extractedFiles.push(new File([blob], fileName, { type: blob.type || "image/jpeg" }));
        }

        buildGroups(extractedFiles);
      } catch (err: any) {
        alert(`Gagal membaca file ZIP: ${err.message}`);
      } finally {
        setExtracting(false);
      }
      return;
    }

    const sorted = [...allFiles].sort((a, b) => naturalCompare(a.name, b.name));
    buildGroups(sorted);
  }

  // Hanya proses grup yang belum dinilai atau yang gagal —
  // grup yang sudah berhasil tidak dinilai ulang (hemat biaya).
  async function processQueue() {
    setRunning(true);
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status === "waiting" || queue[i].status === "error") {
        await processItem(i);
      }
    }
    setRunning(false);
  }

  async function retryItem(index: number) {
    setRunning(true);
    await processItem(index);
    setRunning(false);
  }

  async function processItem(index: number) {
    setQueue((prev) =>
      prev.map((item, i) => (i === index ? { ...item, status: "processing", errorMsg: undefined } : item))
    );

    try {
      const item = queue[index];

      const photoUrls: string[] = [];
      for (let p = 0; p < item.files.length; p++) {
        const path = `${examId}/bulk-${Date.now()}-${index}-p${p + 1}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("submission-photos")
          .upload(path, item.files[p], { upsert: true });
        if (uploadError) throw new Error(uploadError.message);

        const { data: publicUrlData } = supabase.storage
          .from("submission-photos")
          .getPublicUrl(path);
        photoUrls.push(publicUrlData.publicUrl);
      }

      const res = await fetch("/api/grade-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam_id: examId, photo_urls: photoUrls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menilai");

      setQueue((prev) =>
        prev.map((it, i) =>
          i === index
            ? data.matched
              ? {
                  ...it,
                  status: "matched",
                  matchedStudent: data.student,
                  studentNameRead: data.student_name_read,
                  totalScore: data.total_score,
                }
              : {
                  ...it,
                  status: "needs_review",
                  studentNameRead: data.student_name_read,
                  bestGuessId: data.best_guess?.id,
                  selectedStudentId: data.best_guess?.id ?? "",
                  photoUrls: data.photo_urls,
                  totalScore: data.total_score,
                  scores: data.scores,
                  modelUsed: data.model_used,
                }
            : it
        )
      );
    } catch (err: any) {
      setQueue((prev) =>
        prev.map((it, i) => (i === index ? { ...it, status: "error", errorMsg: err.message } : it))
      );
    }
  }

  async function confirmManualMatch(index: number) {
    const item = queue[index];
    if (!item.selectedStudentId) return;

    setQueue((prev) =>
      prev.map((it, i) => (i === index ? { ...it, status: "processing", errorMsg: undefined } : it))
    );

    try {
      const res = await fetch("/api/finalize-bulk-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exam_id: examId,
          student_id: item.selectedStudentId,
          photo_urls: item.photoUrls,
          total_score: item.totalScore,
          scores: item.scores,
          model_used: item.modelUsed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan");

      setQueue((prev) =>
        prev.map((it, i) => (i === index ? { ...it, status: "saved" } : it))
      );
    } catch (err: any) {
      setQueue((prev) =>
        prev.map((it, i) =>
          i === index
            ? { ...it, status: "needs_review", errorMsg: `Gagal menyimpan: ${err.message}. Klik Simpan lagi.` }
            : it
        )
      );
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium">
          Upload 1 File ZIP (isi semua foto), atau Pilih Banyak Foto Langsung
        </label>
        <p className="mb-2 text-xs text-gray-500">
          Ujian ini diatur {pagesPerSubmission} halaman per siswa. Foto akan
          diurutkan otomatis berdasarkan NAMA FILE (bukan urutan pilih), lalu
          dikelompokkan per siswa berdasarkan nama file (nomor halaman di
          akhir nama diabaikan, misal NAMA SISWA0001.jpg, NAMA SISWA0002.jpg).
        </p>
        <input
          type="file"
          accept="image/*,.zip,application/zip"
          multiple
          onChange={(e) => handleFilesSelected(e.target.files)}
          className="w-full text-sm"
        />
        {extracting && (
          <p className="mt-1 text-sm text-blue-600">Membuka file ZIP...</p>
        )}
      </div>

      {queue.length > 0 && (
        <button
          type="button"
          onClick={processQueue}
          disabled={
            running || !queue.some((it) => it.status === "waiting" || it.status === "error")
          }
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {running
            ? "Memproses..."
            : queue.some((it) => it.status === "error")
            ? `↻ Coba Lagi ${queue.filter((it) => it.status === "error").length} Grup yang Gagal`
            : `Proses ${queue.length} Siswa (${queue.reduce((n, it) => n + it.files.length, 0)} foto)`}
        </button>
      )}

      <div className="space-y-2">
        {queue.map((item, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-md border border-gray-200 bg-white p-3 text-sm"
          >
            <div className="flex-1">
              <p className="font-medium">
                Grup {i + 1} ({item.files.length} halaman) — mulai dari{" "}
                {item.files[0]?.name}
              </p>
              {item.files.length !== pagesPerSubmission && (
                <p className="text-xs text-amber-600">
                  Jumlah halaman beda dari pengaturan ujian ({pagesPerSubmission}{" "}
                  halaman) — cek apakah ada foto yang kurang/lebih.
                </p>
              )}

              {item.status === "waiting" && (
                <p className="text-gray-400">Menunggu diproses...</p>
              )}
              {item.status === "processing" && (
                <p className="text-blue-600">Sedang dinilai AI...</p>
              )}
              {item.status === "matched" && (
                <p className="text-green-700">
                  ✓ Cocok: {item.matchedStudent?.roll_number}.{" "}
                  {item.matchedStudent?.full_name} — Skor {item.totalScore}
                </p>
              )}
              {item.status === "saved" && (
                <p className="text-green-700">✓ Tersimpan</p>
              )}
              {item.status === "error" && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-red-600">Error: {item.errorMsg}</p>
                  <button
                    type="button"
                    onClick={() => retryItem(i)}
                    disabled={running}
                    className="rounded-md border border-red-300 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    ↻ Coba lagi
                  </button>
                </div>
              )}
              {item.status === "needs_review" && (
                <div className="mt-1 space-y-1">
                  <p className="text-amber-700">
                    ⚠ Nama terbaca: "{item.studentNameRead ?? "-"}" — tidak yakin
                    cocok siapa. Pilih manual:
                  </p>
                  {item.errorMsg && (
                    <p className="text-xs text-red-600">{item.errorMsg}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <select
                      value={item.selectedStudentId ?? ""}
                      onChange={(e) =>
                        setQueue((prev) =>
                          prev.map((it, idx) =>
                            idx === i ? { ...it, selectedStudentId: e.target.value } : it
                          )
                        )
                      }
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value="">-- pilih siswa --</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.roll_number}. {s.full_name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => confirmManualMatch(i)}
                      disabled={!item.selectedStudentId}
                      className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      Simpan (Skor {item.totalScore})
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
