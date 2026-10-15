// lib/reportTypes.ts
// Data laporan per siswa yang dipakai generator PDF (teks asli, bukan gambar).

export type PdfItem = { number: string; text: string; reasoning: string };
export type PdfGroup = {
  indicator: string | null;
  correct: number;
  total: number;
  items: PdfItem[];
};
export type PdfSubject = {
  name: string;
  useIndicators: boolean;
  masteredCount: number;
  total: number;
  masteredIndicators: string[];
  reinforcement: PdfGroup[];
  more: PdfGroup[];
};
export type PdfStudent = {
  id: string;
  name: string;
  className: string;
  subjects: PdfSubject[];
  indicatorMap: { subject: string; entries: { indicator: string; questions: string }[] }[];
};

// Nama mapel lengkap untuk laporan (nama di database tetap singkat)
const SUBJECT_DISPLAY: Record<string, string> = {
  GP: "Global Perspectives",
  ICT: "Information and Communication Technology",
  Math: "Mathematics",
  Maths: "Mathematics",
};
export const subjectDisplayName = (name: string) => SUBJECT_DISPLAY[name] ?? name;
