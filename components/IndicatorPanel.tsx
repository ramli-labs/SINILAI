"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Toast from "@/components/Toast";

type Group = { text: string; questionNumbers: string[] };

// Panel indikator di halaman Review: buat dengan AI, lihat pengelompokan soal,
// dan ubah kalimat indikator.
export default function IndicatorPanel({
  examId,
  groups,
  unassigned,
}: {
  examId: string;
  groups: Group[];
  unassigned: string[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(groups.length === 0);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);

  async function generate() {
    if (
      groups.length > 0 &&
      !confirm("Buat ulang indikator? Indikator yang sekarang (termasuk hasil editan) akan diganti.")
    )
      return;
    setLoading(true);
    setToast(null);
    try {
      const res = await fetch("/api/indicators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam_id: examId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal membuat indikator");
      setToast({ msg: `✓ Indikator dibuat untuk ${data.count} soal.`, tone: "success" });
      setEdits({});
      setOpen(true);
      router.refresh();
    } catch (e: any) {
      setToast({ msg: e.message, tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function rename(from: string) {
    const to = (edits[from] ?? from).trim();
    if (!to || to === from) return;
    setSaving(from);
    try {
      const res = await fetch("/api/indicators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam_id: examId, rename: { from, to } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan");
      setToast({ msg: "✓ Indikator tersimpan.", tone: "success" });
      router.refresh();
    } catch (e: any) {
      setToast({ msg: e.message, tone: "error" });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-emerald-900">
          {groups.length > 0 ? (
            <>
              🎯 <b>{groups.length}</b> indikator untuk Laporan Orang Tua
              {unassigned.length > 0 && (
                <span className="text-amber-700"> · {unassigned.length} soal belum punya indikator</span>
              )}
            </>
          ) : (
            <>🎯 Ujian ini belum punya indikator. Laporan Orang Tua akan menampilkan indikator yang dikuasai siswa.</>
          )}
        </span>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? "Membuat indikator…" : groups.length > 0 ? "↻ Buat ulang dengan AI" : "🎯 Buat indikator dengan AI"}
        </button>
        {groups.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-emerald-800 hover:underline"
          >
            {open ? "Sembunyikan" : "Lihat & edit"}
          </button>
        )}
      </div>

      {open && groups.length > 0 && (
        <ul className="mt-3 space-y-2">
          {groups.map((g) => (
            <li key={g.text} className="rounded border border-emerald-200 bg-white p-2">
              <div className="flex items-center gap-2">
                <input
                  value={edits[g.text] ?? g.text}
                  onChange={(e) => setEdits((p) => ({ ...p, [g.text]: e.target.value }))}
                  className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() => rename(g.text)}
                  disabled={saving === g.text || (edits[g.text] ?? g.text).trim() === g.text}
                  className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-50 disabled:opacity-40"
                >
                  {saving === g.text ? "Menyimpan…" : "Simpan"}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-gray-500">Soal: {g.questionNumbers.join(", ")}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
