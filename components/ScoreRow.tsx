"use client";

import { useState } from "react";

// Satu baris soal di halaman Review.
// Begitu guru mengetik nilai Override, kotak deskripsi langsung muncul di bawahnya:
// bisa diketik manual atau dibuat dengan AI (memakai nilai yang sedang diketik).
export default function ScoreRow({
  scoreId,
  questionNumber,
  maxMarks,
  aiScore,
  aiReasoning,
  flagged,
  initialOverride,
  initialReasoning,
}: {
  scoreId: string;
  questionNumber: string;
  maxMarks: number | null;
  aiScore: number;
  aiReasoning: string | null;
  flagged: boolean;
  initialOverride: number | null;
  initialReasoning: string | null;
}) {
  const [override, setOverride] = useState(
    initialOverride != null ? String(initialOverride) : ""
  );
  const [reasoning, setReasoning] = useState(initialReasoning ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const hasOverride = override.trim() !== "";

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rewrite-reasoning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score_id: scoreId, new_score: parseFloat(override) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal membuat deskripsi");
      setReasoning(data.teacher_reasoning);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <tr className={"border-t border-gray-100 " + (flagged ? "bg-amber-50" : "")}>
        <td className="py-1.5 align-top">
          {questionNumber}
          {flagged && <span title={aiReasoning ?? ""}> ⚠</span>}
        </td>
        <td className="py-1.5 align-top">
          {aiScore}/{maxMarks ?? "?"}
          <input type="hidden" name={`aiScore-${scoreId}`} value={aiScore} />
          <input type="hidden" name="scoreId" value={scoreId} />
          <input
            type="hidden"
            name={`hadOverride-${scoreId}`}
            value={initialOverride != null ? "1" : "0"}
          />
        </td>
        <td
          className={
            "max-w-xs py-1.5 align-top text-xs " +
            (hasOverride ? "text-gray-400 line-through decoration-gray-300" : "text-gray-500")
          }
        >
          {aiReasoning}
        </td>
        <td className="py-1.5 align-top">
          <input
            type="number"
            step="0.5"
            min={0}
            max={maxMarks ?? undefined}
            name={`override-${scoreId}`}
            placeholder={String(aiScore)}
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </td>
      </tr>

      {hasOverride && (
        <tr className={flagged ? "bg-amber-50" : ""}>
          <td />
          <td colSpan={3} className="pb-2">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-2">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-blue-800">
                  Deskripsi untuk Laporan Orang Tua (nilai {override}/{maxMarks ?? "?"})
                </span>
                <button
                  type="button"
                  onClick={generate}
                  disabled={loading}
                  className="rounded border border-blue-300 bg-white px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  {loading ? "Membuat..." : "✨ Buat dengan AI"}
                </button>
              </div>
              <textarea
                name={`reasoning-${scoreId}`}
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value)}
                rows={2}
                placeholder="Ketik deskripsi sendiri, atau klik ✨ Buat dengan AI."
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
              />
              {error && <p className="text-[11px] text-red-600">{error}</p>}
              {!reasoning.trim() && (
                <p className="text-[11px] text-amber-700">
                  Kalau dibiarkan kosong, laporan memakai deskripsi AI yang lama (dicoret di atas).
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
