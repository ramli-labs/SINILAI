"use client";

import { useState } from "react";

interface ReportEntry {
  elementId: string;
  fileName: string;
}

export default function ExportPdfZipButton({
  entries,
  zipFileName,
}: {
  entries: ReportEntry[];
  zipFileName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleExport() {
    setLoading(true);
    setProgress(0);

    try {
      const [{ default: jsPDF }, { default: html2canvas }, { default: JSZip }] =
        await Promise.all([
          import("jspdf"),
          import("html2canvas"),
          import("jszip"),
        ]);

      const zip = new JSZip();

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const el = document.getElementById(entry.elementId);
        if (!el) continue;

        const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
        const imgData = canvas.toDataURL("image/png");

        const pdf = new jsPDF({
          unit: "px",
          format: [canvas.width, canvas.height],
        });
        pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);

        const pdfBlob = pdf.output("blob");
        zip.file(`${entry.fileName}.pdf`, pdfBlob);

        setProgress(i + 1);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipFileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Gagal membuat ZIP: ${err.message}`);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      className="print:hidden rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
    >
      {loading
        ? `Membuat PDF... (${progress}/${entries.length})`
        : "Download ZIP (PDF per Siswa)"}
    </button>
  );
}
