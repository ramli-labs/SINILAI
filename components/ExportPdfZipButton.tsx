"use client";

import { useState } from "react";

interface ReportEntry {
  elementId: string;
  fileName: string;
  footer?: string; // teks kiri footer, mis. "Nama Siswa · 7A"
}

// Tempel gambar laporan ke PDF A4 dengan margin 10 mm.
// - Bila hanya sedikit lebih panjang dari 1 halaman (<= 15%), dikecilkan agar muat 1 halaman.
// - Bila lebih panjang, dipotong per halaman di baris yang kosong (putih),
//   supaya teks tidak terbelah di tengah.
const MARGIN_MM = 10;
const FOOTER_MM = 8; // ruang tambahan di bawah untuk footer
// Gambar disimpan sebagai PNG TERKOMPRES ("FAST"). Sebelumnya tanpa kompresi,
// sehingga 1 halaman ± 10 MB. Untuk halaman berisi teks, PNG terkompres lebih
// kecil dan lebih tajam daripada JPEG (± 0,2–0,3 MB/halaman).
const toPng = (c: HTMLCanvasElement) => c.toDataURL("image/png");

// Rentang (dalam piksel canvas) yang tidak boleh terpotong di tengahnya,
// mis. judul mapel beserta beberapa baris pertama isinya.
type KeepRange = { start: number; end: number };

function addCanvasToPdf(pdf: any, canvas: HTMLCanvasElement, keep: KeepRange[] = []) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const usableW = pageW - MARGIN_MM * 2;
  const usableH = pageH - MARGIN_MM * 2 - FOOTER_MM;

  const fullHmm = (canvas.height * usableW) / canvas.width;

  if (fullHmm <= usableH * 1.15) {
    const scale = Math.min(1, usableH / fullHmm);
    const w = usableW * scale;
    const h = fullHmm * scale;
    pdf.addImage(toPng(canvas), "PNG", (pageW - w) / 2, MARGIN_MM, w, h, undefined, "FAST");
    return;
  }

  const pxPerMm = canvas.width / usableW;
  const pagePx = Math.floor(usableH * pxPerMm);
  const ctx = canvas.getContext("2d");

  let top = 0;
  let first = true;
  while (top < canvas.height) {
    let cut = Math.min(top + pagePx, canvas.height);
    // Jangan memotong di dalam rentang "keep": pindahkan potongan ke atas rentang itu
    // (selama halaman ini tetap terisi minimal 30%), supaya judul ikut ke halaman berikutnya.
    if (cut < canvas.height) {
      const hit = keep.find((r) => r.start < cut && cut < r.end && r.start > top + pagePx * 0.3);
      if (hit) cut = Math.floor(hit.start);
    }
    if (cut < canvas.height && ctx) {
      cut = findBlankRow(ctx, canvas.width, cut, Math.floor(pagePx * 0.2)) ?? cut;
    }
    const sliceH = cut - top;
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceH;
    slice.getContext("2d")!.drawImage(canvas, 0, top, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

    if (!first) pdf.addPage();
    pdf.addImage(toPng(slice), "PNG", MARGIN_MM, MARGIN_MM, usableW, sliceH / pxPerMm, undefined, "FAST");
    first = false;
    top = cut;
  }
}

// Footer tiap halaman: teks kiri (nama siswa · kelas) dan "Page x of y" di kanan
function addFooters(pdf: any, leftText?: string) {
  const total = pdf.getNumberOfPages();
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const y = pageH - MARGIN_MM + 2;
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(220);
    pdf.line(MARGIN_MM, y - 5, pageW - MARGIN_MM, y - 5);
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    if (leftText) pdf.text(leftText, MARGIN_MM, y);
    pdf.text(`Page ${i} of ${total}`, pageW - MARGIN_MM, y, { align: "right" });
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

        // Posisi blok yang harus utuh (judul mapel + awal isinya, peta indikator)
        const elRect = el.getBoundingClientRect();
        const scaleY = canvas.height / el.scrollHeight;
        const keep = Array.from(el.querySelectorAll("[data-keep-with-next]")).map((node) => {
          const r = (node as HTMLElement).getBoundingClientRect();
          // Batasi tinggi rentang agar blok sangat panjang tetap bisa dipotong
          const height = Math.min(r.height, 260);
          return {
            start: Math.max(0, (r.top - elRect.top - 6) * scaleY),
            end: (r.top - elRect.top + height) * scaleY,
          };
        });

        const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
        addCanvasToPdf(pdf, canvas, keep);
        addFooters(pdf, entry.footer);

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
