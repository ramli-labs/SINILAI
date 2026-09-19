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
  file: File;
  status: ItemStatus;
  studentNameRead?: string;
  matchedStudent?: { id: string; full_name: string; roll_number: number };
  bestGuessId?: string;
  photoUrl?: string;
  totalScore?: number;
  scores?: any[];
  errorMsg?: string;
  selectedStudentId?: string;
}

export default function BulkPhotoUpload({
  examId,
  students,
}: {
  examId: string;
  students: Student[];
}) {
  const supabase = createClient();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    setQueue(
      Array.from(files).map((file) => ({ file, status: "waiting" as ItemStatus }))
    );
  }

  async function processQueue() {
    setRunning(true);
    for (let i = 0; i < queue.length; i++) {
      await processItem(i);
    }
    setRunning(false);
  }

  async function processItem(index: number) {
    setQueue((prev) =>
      prev.map((item, i) => (i === index ? { ...item, status: "processing" } : item))
    );

    try {
      const item = queue[index];
      const path = `${examId}/bulk-${Date.now()}-${index}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("submission-photos")
        .upload(path, item.file, { upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data: publicUrlData } = supabase.storage
        .from("submission-photos")
        .getPublicUrl(path);

      const res = await fetch("/api/grade-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam_id: examId, photo_url: publicUrlData.publicUrl }),
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
                  photoUrl: data.photo_url,
                  totalScore: data.total_score,
                  scores: data.scores,
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
      prev.map((it, i) => (i === index ? { ...it, status: "processing" } : it))
    );

    try {
      const res = await fetch("/api/finalize-bulk-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exam_id: examId,
          student_id: item.selectedStudentId,
          photo_url: item.photoUrl,
          total_score: item.totalScore,
          scores: item.scores,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan");

      setQueue((prev) =>
        prev.map((it, i) => (i === index ? { ...it, status: "saved" } : it))
      );
    } catch (err: any) {
      setQueue((prev) =>
        prev.map((it, i) => (i === index ? { ...it, status: "error", errorMsg: err.message } : it))
      );
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium">
          Pilih Banyak Foto Sekaligus
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFilesSelected(e.target.files)}
          className="w-full text-sm"
        />
      </div>

      {queue.length > 0 && (
        <button
          type="button"
          onClick={processQueue}
          disabled={running}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? "Memproses..." : `Proses ${queue.length} Foto`}
        </button>
      )}

      <div className="space-y-2">
        {queue.map((item, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-md border border-gray-200 bg-white p-3 text-sm"
          >
            <div className="flex-1">
              <p className="font-medium">{item.file.name}</p>

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
                <p className="text-red-600">Error: {item.errorMsg}</p>
              )}
              {item.status === "needs_review" && (
                <div className="mt-1 space-y-1">
                  <p className="text-amber-700">
                    ⚠ Nama terbaca: "{item.studentNameRead ?? "-"}" — tidak yakin
                    cocok siapa. Pilih manual:
                  </p>
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
