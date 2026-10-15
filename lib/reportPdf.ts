// lib/reportPdf.ts  (dipakai di browser)
// Membuat PDF Laporan Orang Tua sebagai TEKS ASLI (pdfmake), bukan gambar:
// ukuran kecil, teks tajam & bisa disalin, nomor halaman per siswa.

import type { PdfStudent, PdfGroup } from "@/lib/reportTypes";

const NAVY = "#1f2a44";
const GREEN = "#1f7a3a";
const AMBER = "#a16207";
const RED = "#b91c1c";
const GRAY = "#555555";
const LIGHT = "#bfbfbf";

let pdfMakePromise: Promise<any> | null = null;

async function toBase64(url: string): Promise<string> {
  const buf = await (await fetch(url)).arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Muat pdfmake + font Inter + banner sekali saja
export async function loadPdfMake(): Promise<{ pdfMake: any; banner: string }> {
  if (!pdfMakePromise) {
    pdfMakePromise = (async () => {
      const mod: any = await import("pdfmake/build/pdfmake");
      const pdfMake = mod.default ?? mod;
      const [regular, bold, italic, boldItalic, banner] = await Promise.all([
        toBase64("/fonts/Inter-Regular.ttf"),
        toBase64("/fonts/Inter-Bold.ttf"),
        toBase64("/fonts/Inter-Italic.ttf"),
        toBase64("/fonts/Inter-BoldItalic.ttf"),
        toBase64("/report-banner.jpg"),
      ]);
      pdfMake.vfs = {
        "Inter-Regular.ttf": regular,
        "Inter-Bold.ttf": bold,
        "Inter-Italic.ttf": italic,
        "Inter-BoldItalic.ttf": boldItalic,
      };
      pdfMake.fonts = {
        Inter: {
          normal: "Inter-Regular.ttf",
          bold: "Inter-Bold.ttf",
          italics: "Inter-Italic.ttf",
          bolditalics: "Inter-BoldItalic.ttf",
        },
      };
      return { pdfMake, banner: `data:image/jpeg;base64,${banner}` };
    })();
  }
  return pdfMakePromise;
}

// Ukuran mengikuti contoh laporan: A4, margin kiri/kanan 2 cm, teks 9 pt.
const CONTENT_W = 481.85;

const rule = (color = LIGHT, top = 2, bottom = 6, width = 0.75) => ({
  canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: width, lineColor: color }],
  margin: [0, top, 0, bottom],
});

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

// Baris bernomor dengan kolom nomor tetap (rapi seperti daftar Word)
const numbered = (marker: string, body: any, opts: any = {}) => ({
  columns: [{ width: opts.markerWidth ?? 20, text: marker, bold: !!opts.boldMarker }, { width: "*", ...body }],
  ...opts.extra,
});

// Soal a., b., ... beserta deskripsinya (tidak boleh terbelah)
function itemBlock(it: { number: string; text: string; reasoning: string }, k: number) {
  return {
    unbreakable: true,
    margin: [0, 0, 0, 5],
    ...numbered(`${LETTERS[k] ?? k + 1}.`, {
      stack: [
        { text: it.text || it.number },
        it.reasoning
          ? { text: it.reasoning, italics: true, color: GRAY, alignment: "justify" }
          : "",
      ],
    }, { markerWidth: 22 }),
  };
}

// Satu kelompok indikator → { head: judul + soal pertama (dikunci bersama), rest: soal lainnya }
function groupParts(g: PdfGroup, idx: number) {
  const items = g.items.map((it, k) => ({ stack: [itemBlock(it, k)], margin: [20, 0, 0, 0] }));
  if (!g.indicator) return { head: items.slice(0, 1), rest: items.slice(1) };
  const title = numbered(
    `${idx + 1}.`,
    {
      stack: [
        { text: g.indicator, bold: true },
        { text: `(${g.correct} of ${g.total} correct)`, color: GRAY, margin: [0, 0, 0, 4] },
      ],
    },
    { boldMarker: true }
  );
  return { head: [title, ...items.slice(0, 1)], rest: items.slice(1) };
}

// Kunci beberapa blok agar tidak terpisah halaman
const keep = (...blocks: any[]) => ({ unbreakable: true, stack: blocks });

export function buildDocDefinition(s: PdfStudent, banner: string) {
  const content: any[] = [
    { image: banner, width: 411, alignment: "center", margin: [0, 0, 0, 13] },
    { text: "Student Learning Report", fontSize: 16, bold: true, color: NAVY, alignment: "center", margin: [0, 0, 0, 6] },
    { text: `Name: ${s.name}`, bold: true, alignment: "center", fontSize: 10, lineHeight: 1.08 },
    { text: `Class: ${s.className}`, bold: true, alignment: "center", fontSize: 10, lineHeight: 1.08, margin: [0, 0, 0, 8] },
    rule(NAVY, 0, 18, 1),
  ];

  if (s.subjects.length === 0) {
    content.push({ text: "No exam results have been recorded for this student yet.", color: GRAY });
  }

  for (const sub of s.subjects) {
    const subjectTitle = [
      { text: sub.name, bold: true, fontSize: 10, lineHeight: 1.08, color: NAVY, alignment: "center" },
      rule(LIGHT, 4, 9),
    ];
    const masteredTitle = {
      text: `Mastered (${sub.masteredCount} of ${sub.total} questions answered fully correctly)${sub.masteredIndicators.length ? ":" : ""}`,
      bold: true,
      color: GREEN,
      margin: [0, 0, 0, 4],
    };
    const masteredLines = sub.masteredIndicators.map((t, i) =>
      numbered(`${i + 1}.`, { text: t }, { extra: { margin: [0, 0, 0, 3] } })
    );

    // Judul mapel + "Mastered" + baris pertamanya dikunci bersama
    content.push(keep(...subjectTitle, masteredTitle, ...masteredLines.slice(0, 1)));
    content.push(...masteredLines.slice(1));
    content.push({ text: "", margin: [0, 0, 0, 5] });

    const section = (title: string, color: string, groups: PdfGroup[]) => {
      if (!groups.length) return;
      const heading = { text: title, bold: true, color, margin: [0, 0, 0, 8] };
      groups.forEach((g, i) => {
        const { head, rest } = groupParts(g, i);
        // Judul kategori (untuk kelompok pertama) + judul indikator + soal pertama dikunci bersama
        content.push(i === 0 ? keep(heading, ...head) : keep(...head));
        content.push(...rest);
        content.push({ text: "", margin: [0, 0, 0, 3] });
      });
      content.push({ text: "", margin: [0, 0, 0, 2] });
    };
    section("Needs Reinforcement:", AMBER, sub.reinforcement);
    section("Needs More Understanding:", RED, sub.more);
    content.push({ text: "", margin: [0, 0, 0, 9] });
  }

  if (s.indicatorMap.length) {
    const mapTitle = [
      { text: "Indicator Map: which questions assess each indicator", bold: true, fontSize: 10, lineHeight: 1.08, color: NAVY, margin: [0, 6, 0, 0] },
      rule(LIGHT, 4, 8),
    ];
    s.indicatorMap.forEach((m, mi) => {
      const lines = m.entries.map((e, i) =>
        numbered(
          `${i + 1}.`,
          { text: [`${e.indicator}: `, { text: `Questions ${e.questions}`, italics: true, color: GRAY }] },
          { extra: { margin: [0, 0, 0, 0] } }
        )
      );
      const subjectName = { text: m.subject, bold: true, margin: [0, mi === 0 ? 0 : 5, 0, 0] };
      content.push(mi === 0 ? keep(...mapTitle, subjectName, ...lines.slice(0, 1)) : keep(subjectName, ...lines.slice(0, 1)));
      content.push(...lines.slice(1));
    });
  }

  return {
    pageSize: "A4",
    pageMargins: [56.7, 51, 56.7, 50],
    info: { title: `Student Learning Report - ${s.name}` },
    defaultStyle: { font: "Inter", fontSize: 9, lineHeight: 1.1, color: "#111111" },
    content,
    footer: (currentPage: number) => ({
      text: `${s.name} | ${s.className} | Page ${currentPage}`,
      alignment: "center",
      fontSize: 9,
      color: "#666666",
      margin: [0, 13, 0, 0],
    }),
  };
}

export async function studentPdfBytes(pdfMake: any, banner: string, s: PdfStudent): Promise<Uint8Array> {
  const doc = pdfMake.createPdf(buildDocDefinition(s, banner));
  return new Promise((resolve, reject) => {
    try {
      doc.getBuffer((buf: Uint8Array) => resolve(new Uint8Array(buf)));
    } catch (e) {
      reject(e);
    }
  });
}

// Gabungkan PDF semua siswa (nomor halaman tetap mulai 1 per siswa)
export async function buildCombinedPdf(
  students: PdfStudent[],
  onProgress?: (n: number) => void
): Promise<Uint8Array> {
  const { pdfMake, banner } = await loadPdfMake();
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();
  merged.setTitle("Student Learning Report");
  for (let i = 0; i < students.length; i++) {
    const bytes = await studentPdfBytes(pdfMake, banner, students[i]);
    const src = await PDFDocument.load(bytes);
    (await merged.copyPages(src, src.getPageIndices())).forEach((pg) => merged.addPage(pg));
    onProgress?.(i + 1);
  }
  return merged.save();
}
