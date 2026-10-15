"use client";

import { useState } from "react";
import type { PdfStudent } from "@/lib/reportTypes";

// Unduh Laporan Orang Tua sebagai PDF teks asli:
// - "PDF Gabungan": semua siswa dalam satu file (nomor halaman per siswa)
// - "ZIP": satu PDF per siswa
export default function ReportPdfButtons({
  students,
  fileBase,
}: {
  students: PdfStudent[];
  fileBase: string;
}) {
  const [busy, setBusy] = useState<null | "combined" | "zip" | "print">(null);
  const [progress, setProgress] = useState(0);

  async function makeAll() {
    const { loadPdfMake, studentPdfBytes } = await import("@/lib/reportPdf");
    const { pdfMake, banner } = await loadPdfMake();
    const out: { name: string; bytes: Uint8Array }[] = [];
    for (let i = 0; i < students.length; i++) {
      out.push({ name: students[i].name, bytes: await studentPdfBytes(pdfMake, banner, students[i]) });
      setProgress(i + 1);
    }
    return out;
  }

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function combined() {
    setBusy("combined");
    setProgress(0);
    try {
      const { buildCombinedPdf } = await import("@/lib/reportPdf");
      const bytes = await buildCombinedPdf(students, setProgress);
      download(new Blob([bytes as BlobPart], { type: "application/pdf" }), `Laporan_${fileBase}_Gabungan.pdf`);
    } catch (e: any) {
      alert(`Gagal membuat PDF: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  }

  // Cetak: buat PDF (format sama persis, nomor halaman per siswa) lalu buka dialog cetak
  async function printPdf() {
    setBusy("print");
    setProgress(0);
    try {
      const { buildCombinedPdf } = await import("@/lib/reportPdf");
      const bytes = await buildCombinedPdf(students, setProgress);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      frame.src = url;
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } catch {
          // Browser tertentu tidak mengizinkan cetak dari iframe: buka di tab baru
          window.open(url, "_blank");
        }
      };
      document.body.appendChild(frame);
      setTimeout(() => {
        URL.revokeObjectURL(url);
        frame.remove();
      }, 10 * 60 * 1000);
    } catch (e: any) {
      alert(`Gagal menyiapkan cetak: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  }

  async function zip() {
    setBusy("zip");
    setProgress(0);
    try {
      const parts = await makeAll();
      const { default: JSZip } = await import("jszip");
      const z = new JSZip();
      for (const p of parts) z.file(`Laporan_${p.name.replace(/\s+/g, "_")}.pdf`, p.bytes);
      download(await z.generateAsync({ type: "blob" }), `Laporan_${fileBase}.zip`);
    } catch (e: any) {
      alert(`Gagal membuat ZIP: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  }

  const label = (kind: "combined" | "zip" | "print", idle: string) =>
    busy === kind ? `Membuat PDF... (${progress}/${students.length})` : idle;

  return (
    <div className="flex gap-2 print:hidden">
      <button
        type="button"
        onClick={printPdf}
        disabled={!!busy}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {label("print", "Cetak")}
      </button>
      <button
        type="button"
        onClick={combined}
        disabled={!!busy}
        className="rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
      >
        {label("combined", "Download PDF Gabungan")}
      </button>
      <button
        type="button"
        onClick={zip}
        disabled={!!busy}
        className="rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
      >
        {label("zip", "Download ZIP (PDF per Siswa)")}
      </button>
    </div>
  );
}
