// lib/rewriteReasoning.ts
// Menulis ulang deskripsi per soal agar sesuai dengan nilai yang sudah
// diubah guru. Foto jawaban sudah dihapus setelah penilaian, jadi AI hanya
// memakai: soal, mark scheme, deskripsi AI lama, dan nilai baru.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const REWRITE_MODEL = "claude-haiku-5-5";
const FALLBACK_MODEL = "claude-sonnet-5-5";

export interface RewriteInput {
  questionNumber: string;
  questionText: string | null;
  maxMarks: number;
  markScheme: { mark_code: string | null; points: number; accepted_answers: string }[];
  aiScore: number;
  aiReasoning: string | null; // format: "Awarded: ... | Missed: ... | alasan"
  newScore: number;
}

export async function rewriteReasoning(input: RewriteInput): Promise<string> {
  const scheme = input.markScheme
    .map((m) => `- [${m.mark_code ?? "M"}] (${m.points}): ${m.accepted_answers}`)
    .join("\n");

  const system = `You write short feedback lines for a parent report at a Cambridge-curriculum junior high school.
A teacher reviewed an AI-graded answer and changed the score. Rewrite the feedback so it matches the TEACHER'S score.

Rules:
- English, 1–2 short sentences, plain and friendly — the readers are the student's PARENTS.
- Write in third person about the student ("The student correctly…", "The student still needs to…"). Never address the student as "you"/"your".
- Describe what the student understood and what still needs work. Do NOT mention scores, marks, mark codes (B1, C2, ...), the AI, or that the score was changed.
- You cannot see the student's answer. Base the text only on the original feedback and the mark scheme. Do not invent specific details the student wrote.
- If the teacher's score is higher than the AI score, the teacher accepted more of the answer: present the student more positively, and keep only the gaps that still fit the remaining missing points.
- If the teacher's score equals the maximum, say the answer was correct and complete.
- If the teacher's score is lower than the AI score, keep the tone constructive and name what was missing.
- Output only the feedback sentence(s), nothing else.`;

  const user = `Question ${input.questionNumber}${
    input.questionText ? `: ${input.questionText}` : ""
  }
Maximum: ${input.maxMarks}
Mark scheme:
${scheme || "(not available)"}

AI score: ${input.aiScore}/${input.maxMarks}
Original AI feedback: ${input.aiReasoning ?? "(none)"}

Teacher's score: ${input.newScore}/${input.maxMarks}

Write the new feedback.`;

  // Coba dengan Haiku dulu (murah). Bila jawabannya kosong/terpotong
  // (misalnya habis untuk "berpikir" pada soal panjang), ulangi sekali dengan Sonnet.
  try {
    return await callModel(REWRITE_MODEL, 3000, system, user);
  } catch (err: any) {
    if (err instanceof EmptyAnswerError) {
      return await callModel(FALLBACK_MODEL, 6000, system, user);
    }
    throw err;
  }
}

export class EmptyAnswerError extends Error {}

async function callModel(
  model: string,
  maxTokens: number,
  system: string,
  user: string
): Promise<string> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = (data.content ?? [])
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("")
    .trim()
    .replace(/^["']|["']$/g, "");

  if (!text || data.stop_reason === "max_tokens" || data.stop_reason === "refusal") {
    throw new EmptyAnswerError(
      `AI tidak menghasilkan deskripsi (model ${model}, stop_reason: ${data.stop_reason ?? "?"}).`
    );
  }
  return text;
}
