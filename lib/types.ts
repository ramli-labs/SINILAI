// lib/types.ts
// Tipe data inti untuk sistem koreksi jawaban ujian AI.

export interface Question {
  id: string;
  exam_id: string;
  question_number: string; // "1(a)", "1(b)", dst
  question_text: string | null;
  max_marks: number;
  order_index: number;
}

export interface MarkSchemeItem {
  id: string;
  question_id: string;
  mark_code: string | null; // "B1", "C1", "C2", "A3", dst
  points: number;
  accepted_answers: string;
  order_index: number;
}

export interface Student {
  id: string;
  class_id: string;
  roll_number: number;
  full_name: string;
  gender: "L" | "P";
}

export interface Submission {
  id: string;
  exam_id: string;
  student_id: string;
  photo_urls: string[] | null;
  status: "pending" | "processing" | "processed" | "reviewed" | "error";
  ai_model_used: string | null;
  total_ai_score: number | null;
  total_final_score: number | null;
}
