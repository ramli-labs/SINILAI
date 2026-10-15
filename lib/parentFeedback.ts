// lib/parentFeedback.ts
// Mengubah beberapa deskripsi sekaligus (satu permintaan ke Haiku) menjadi
// versi ramah orang tua, orang ketiga ("The student ..."), isi tetap sama.
// Teks pendek, tanpa foto → biaya kecil.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-5-5";
const FALLBACK_MODEL = "claude-sonnet-5-5";

export interface FeedbackItem {
  id: string;
  question: string; // nomor + teks soal singkat (konteks)
  score: string; // misal "3/6"
  text: string; // deskripsi sumber
}

const SYSTEM = `You rewrite short teacher/examiner feedback lines into feedback for a PARENT report at a Cambridge-curriculum junior high school.

For each item:
- Keep the SAME meaning and facts: what was correct and what was missing/wrong. Do not add new facts, and do not change the judgement.
- Write 1–2 short, plain-English sentences in third person ("The student correctly…", "The student still needs to…"). Never use "you"/"your".
- Friendly and constructive. Remove examiner jargon (mark codes like B1/C2, "no credit", "too garbled to credit", "in this key") and do not mention scores.
- If the original says the answer was fully correct, say so positively.

Return JSON: {"items":[{"id": "<same id>", "text": "<rewritten feedback>"}]} with one entry per input item.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, text: { type: "string" } },
        required: ["id", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

class EmptyAnswerError extends Error {}

async function call(model: string, maxTokens: number, items: FeedbackItem[]) {
  const user = items
    .map(
      (it) =>
        `id: ${it.id}\nQuestion: ${it.question}\nScore: ${it.score}\nFeedback: ${it.text}`
    )
    .join("\n\n---\n\n");

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: SYSTEM,
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
  if (!text || data.stop_reason === "max_tokens" || data.stop_reason === "refusal") {
    throw new EmptyAnswerError(
      `AI tidak menghasilkan deskripsi (model ${model}, stop_reason: ${data.stop_reason ?? "?"}).`
    );
  }
  const parsed = JSON.parse(text) as { items: { id: string; text: string }[] };
  return new Map(parsed.items.map((x) => [x.id, x.text.trim()]));
}

export async function toParentFeedback(items: FeedbackItem[]): Promise<Map<string, string>> {
  try {
    return await call(MODEL, 8000, items);
  } catch (err) {
    if (err instanceof EmptyAnswerError) return await call(FALLBACK_MODEL, 12000, items);
    throw err;
  }
}

// Deskripsi masih menyapa siswa langsung ("you/your")?
export function usesSecondPerson(text: string | null | undefined): boolean {
  return !!text && /\b(you|your|you're|you've|yours)\b/i.test(text);
}

// Ambil bagian alasan dari format "Awarded: ... | Missed: ... | alasan"
export function extractReasoning(raw: string | null): string {
  if (!raw) return "";
  const parts = raw.split("|");
  return parts.length >= 3 ? parts.slice(2).join("|").trim() : raw;
}
