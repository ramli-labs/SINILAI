"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Student {
  id: string;
  roll_number: number;
  full_name: string;
}

export default function PhotoUpload({
  examId,
  students,
}: {
  examId: string;
  students: Student[];
}) {
  const supabase = createClient();
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "grading" | "done" | "error">("idle");
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !studentId) return;

    setStatus("uploading");
    setErrorMsg(null);
    setResult(null);

    try {
      // 1. Upload foto ke Supabase Storage (bucket: submission-photos)
      const path = `${examId}/${studentId}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("submission-photos")
        .upload(path, file, { upsert: true });

      if (uploadError) throw new Error(uploadError.message);

      const { data: publicUrlData } = supabase.storage
        .from("submission-photos")
        .getPublicUrl(path);

      // 2. Buat/update baris submission
      const { data: submission, error: subError } = await supabase
        .from("submissions")
        .upsert(
          {
            exam_id: examId,
            student_id: studentId,
            photo_url: publicUrlData.publicUrl,
            status: "pending",
          },
          { onConflict: "exam_id,student_id" }
        )
        .select("id")
        .single();

      if (subError || !submission) throw new Error(subError?.message ?? "Gagal simpan submission");

      // 3. Panggil endpoint grading
      setStatus("grading");
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submission.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menilai");

      setResult(data);
      setStatus("done");
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus("error");
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Siswa</label>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.roll_number}. {s.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Foto Lembar Jawaban
          </label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={!file || status === "uploading" || status === "grading"}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {status === "uploading" && "Mengunggah..."}
          {status === "grading" && "Menilai dengan AI..."}
          {(status === "idle" || status === "done" || status === "error") &&
            "Upload & Nilai"}
        </button>
      </form>

      {errorMsg && (
        <p className="mt-3 text-sm text-red-600">Error: {errorMsg}</p>
      )}

      {result && (
        <div className="mt-4 border-t border-gray-100 pt-3 text-sm">
          <p className="font-medium">
            Nama terbaca AI: {result.student_name_read ?? "-"}
          </p>
          <p className="mb-2 text-gray-600">
            Total skor AI: {result.total_score}
          </p>
          <p className="mb-2 rounded bg-yellow-50 px-2 py-1 text-xs text-yellow-800">
            [DEBUG] Baris tersimpan ke database: {result.debug_saved_rows_count}
            {result.debug_saved_rows_count === 0 && " — TIDAK ADA YANG TERSIMPAN!"}
          </p>
          <ul className="space-y-1">
            {result.scores?.map((s: any) => (
              <li
                key={s.question_id}
                className={
                  s.flagged_for_review ? "text-amber-700" : "text-gray-700"
                }
              >
                {s.question_number}: {s.ai_score}/{s.max_score}
                {s.flagged_for_review ? " ⚠ perlu dicek guru" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
