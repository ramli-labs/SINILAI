// lib/indicators.ts
// Mengelompokkan soal satu ujian menjadi 4–8 indikator (kalimat can-do pendek)
// untuk Laporan Orang Tua. Satu permintaan teks per ujian (tanpa foto).

import type { SupabaseClient } from "@supabase/supabase-js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5-5";

const SCHEMA = {
  type: "object",
  properties: {
    indicators: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          question_ids: { type: "array", items: { type: "string" } },
        },
        required: ["text", "question_ids"],
        additionalProperties: false,
      },
    },
  },
  required: ["indicators"],
  additionalProperties: false,
};

function buildSystem(subject: string) {
  return `You group the questions of one ${subject} exam (Cambridge curriculum, junior high school) into learning indicators for a PARENT report.

Rules:
- Make 4 to 8 indicators for the whole exam (fewer for short exams). Group questions that test the same skill or topic.
- Every question id must appear in exactly ONE indicator.
- Each indicator is a short "can-do" sentence in plain English, max 12 words, starting with "Can", e.g. "Can identify specific details in a reading text", "Can calculate density from mass and volume".
- Describe the skill/topic, not the question format (avoid "gap-fill", "question 3", "section B").
- Do not mention marks, scores, or the exam itself.`;
}

export async function generateIndicatorsForExam(
  svc: SupabaseClient,
  examId: string
): Promise<number> {
  const { data: exam } = await svc
    .from("exams")
    .select("id, title, subjects(name)")
    .eq("id", examId)
    .single();
  const subject = (exam as any)?.subjects?.name ?? "subject";

  const { data: questions } = await svc
    .from("questions")
    .select("id, question_number, question_text, max_marks")
    .eq("exam_id", examId)
    .order("order_index");
  if (!questions || questions.length === 0) return 0;

  const { data: ms } = await svc
    .from("mark_scheme_items")
    .select("question_id, accepted_answers")
    .in("question_id", questions.map((q) => q.id));
  const msByQ = new Map<string, string[]>();
  for (const m of ms ?? []) {
    const arr = msByQ.get(m.question_id) ?? [];
    arr.push(String(m.accepted_answers).slice(0, 120));
    msByQ.set(m.question_id, arr);
  }

  const user = questions
    .map(
      (q) =>
        `id: ${q.id}\n${q.question_number}: ${String(q.question_text ?? "").slice(0, 200)}\nAnswer key: ${(msByQ.get(q.id) ?? []).join(" / ").slice(0, 240)}`
    )
    .join("\n\n");

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system: buildSystem(subject),
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude API error (${res.status}): ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content ?? [])
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("");
  if (!text || data.stop_reason === "max_tokens") {
    throw new Error(`AI tidak menghasilkan indikator (stop_reason: ${data.stop_reason ?? "?"}).`);
  }
  const parsed = JSON.parse(text) as { indicators: { text: string; question_ids: string[] }[] };

  const valid = new Set(questions.map((q) => q.id));
  const assigned = new Map<string, string>();
  for (const ind of parsed.indicators) {
    const label = ind.text.trim().replace(/\.$/, "");
    for (const id of ind.question_ids) {
      if (valid.has(id) && !assigned.has(id)) assigned.set(id, label);
    }
  }

  // Soal yang terlewat oleh AI: ikut indikator soal sebelumnya (soal berurutan
  // biasanya satu materi); bila tidak ada, ikut soal sesudahnya.
  const ordered = questions.map((q) => q.id);
  for (let i = 0; i < ordered.length; i++) {
    if (assigned.has(ordered[i])) continue;
    let label: string | undefined;
    for (let j = i - 1; j >= 0 && !label; j--) label = assigned.get(ordered[j]);
    for (let j = i + 1; j < ordered.length && !label; j++) label = assigned.get(ordered[j]);
    if (label) assigned.set(ordered[i], label);
  }

  // Hapus indikator lama dulu, supaya hasil percobaan sebelumnya tidak ikut terhitung
  const { error: clearError } = await svc
    .from("questions")
    .update({ indicator: null })
    .eq("exam_id", examId);
  if (clearError) throw new Error(clearError.message);

  // Simpan per indikator (satu update untuk banyak soal)
  const byLabel = new Map<string, string[]>();
  assigned.forEach((label, id) => byLabel.set(label, [...(byLabel.get(label) ?? []), id]));
  for (const [label, ids] of Array.from(byLabel.entries())) {
    const { error } = await svc.from("questions").update({ indicator: label }).in("id", ids);
    if (error) throw new Error(error.message);
  }
  return assigned.size;
}
