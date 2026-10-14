"use client";

import { useState } from "react";

interface ReportEntry {
  elementId: string;
  fileName: string;
}

// Tempel gambar laporan ke PDF A4 dengan margin 10 mm.
// - Bila hanya sedikit lebih panjang dari 1 halaman (<= 15%), dikecilkan agar muat 1 halaman.
// - Bila lebih panjang, dipotong per halaman di baris yang kosong (putih),
//   supaya teks tidak terbelah di tengah.
const MARGIN_MM = 10;

function addCanvasToPdf(pdf: any, canvas: HTMLCanvasElement) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const usableW = pageW - MARGIN_MM * 2;
  const usableH = pageH - MARGIN_MM * 2;

  const fullHmm = (canvas.height * usableW) / canvas.width;

  if (fullHmm <= usableH * 1.15) {
    const scale = Math.min(1, usableH / fullHmm);
    const w = usableW * scale;
    const h = fullHmm * scale;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pageW - w) / 2, MARGIN_MM, w, h);
    return;
  }

  const pxPerMm = canvas.width / usableW;
  const pagePx = Math.floor(usableH * pxPerMm);
  const ctx = canvas.getContext("2d");

  let top = 0;
  let first = true;
  while (top < canvas.height) {
    let cut = Math.min(top + pagePx, canvas.height);
    if (cut < canvas.height && ctx) {
      cut = findBlankRow(ctx, canvas.width, cut, Math.floor(pagePx * 0.2)) ?? cut;
    }
    const sliceH = cut - top;
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceH;
    slice.getContext("2d")!.drawImage(canvas, 0, top, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

    if (!first) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/png"), "PNG", MARGIN_MM, MARGIN_MM, usableW, sliceH / pxPerMm);
    first = false;
    top = cut;
  }
}

// Cari baris piksel yang (hampir) putih semua, mundur dari `from` maksimal `range` px.
function findBlankRow(
  ctx: CanvasRenderingContext2D,
  width: number,
  from: number,
  range: number
): number | null {
  const start = Math.max(0, from - range);
  const data = ctx.getImageData(0, start, width, from - start).data;
  for (let y = from - start - 1; y >= 0; y--) {
    let blank = true;
    for (let x = 0; x < width; x += 3) {
      const i = (y * width + x) * 4;
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) {
        blank = false;
        break;
      }
    }
    if (blank) return start + y;
  }
  return null;
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
        const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
        addCanvasToPdf(pdf, canvas);

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
