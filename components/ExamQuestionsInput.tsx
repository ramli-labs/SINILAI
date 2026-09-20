"use client";

import { useState } from "react";

export default function ExamQuestionsInput({
  initialValue = "",
  initialMode = "upload",
}: {
  initialValue?: string;
  initialMode?: "upload" | "manual";
}) {
  const [mode, setMode] = useState<"upload" | "manual">(initialMode);
  const [qpFile, setQpFile] = useState<File | null>(null);
  const [msFile, setMsFile] = useState<File | null>(null);
  const [value, setValue] = useState(initialValue);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleParse() {
    if (!qpFile) return;
    setParsing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("qp", qpFile);
      if (msFile) formData.append("ms", msFile);

      const res = await fetch("/api/parse-exam", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal mengurai dokumen");

      setValue(data.questionsRaw);
      setMode("manual");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`rounded-md px-3 py-1 ${
            mode === "upload"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          Upload Word (otomatis)
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-md px-3 py-1 ${
            mode === "manual"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          Ketik Manual
        </button>
      </div>

      {mode === "upload" && (
        <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              File Soal (.docx) — wajib
            </label>
            <input
              type="file"
              accept=".docx"
              onChange={(e) => setQpFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              File Mark Scheme (.docx) — opsional, tapi disarankan
            </label>
            <input
              type="file"
              accept=".docx"
              onChange={(e) => setMsFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
          </div>
          <button
            type="button"
            onClick={handleParse}
            disabled={!qpFile || parsing}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {parsing ? "Mengurai dengan AI... (bisa 30-60 detik)" : "Urai Otomatis dengan AI"}
          </button>
          {error && <p className="text-sm text-red-600">Error: {error}</p>}
          <p className="text-xs text-gray-500">
            Setelah diurai, hasilnya bisa Bapak/Ibu review dan edit dulu di
            tab "Ketik Manual" sebelum disimpan.
          </p>
        </div>
      )}

      {mode === "manual" && (
        <textarea
          name="questionsRaw"
          required
          rows={16}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            "Q: 1(a) | 1 | State the equation linking density, mass and volume\n" +
            "MS: B1 | 1 | density = mass/volume\n\n" +
            "Q: 1(b) | 3 | Calculate the volume of the steel cube\n" +
            "MS: C1 | 1 | uses volume = mass/density\n" +
            "MS: C2 | 1 | correct substitution 110/7900\n" +
            "MS: A3 | 1 | 0.014 m3 (accept 0.0139-0.014)"
          }
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
        />
      )}

      {mode === "upload" && (
        <textarea name="questionsRaw" value={value} readOnly hidden />
      )}
    </div>
  );
}
