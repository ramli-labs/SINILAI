// lib/claude.ts
// Wrapper untuk memanggil Claude API dan menilai jawaban siswa
// sesuai mark scheme, mengikuti pola yang sudah divalidasi manual
// untuk Fisika Mid Term 1 (kode marking B1/C1/C2/A3 ala Cambridge),
// kini menyesuaikan aturan per mapel (Physics, Math, Biology, English, GP, ICT).

import type { MarkSchemeItem, Question } from "./types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5-5";

export interface QuestionScoreResult {
  question_id: string;
  question_number: string;
  ai_score: number;
  max_score: number;
  marks_awarded: string[];
  marks_missed: string[];
  reasoning: string;
  confidence: "high" | "medium" | "low";
  flagged_for_review: boolean;
  flag_reason?: string;
}

export interface GradingResponse {
  student_name_read: string | null;
  scores: QuestionScoreResult[];
}

interface GradeSubmissionInput {
  images: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" }[];
  questions: Question[];
  markSchemeItems: MarkSchemeItem[];
  model?: string;
  subjectName?: string | null;
}

type SubjectKind = "physics" | "math" | "science" | "english" | "gp" | "ict" | "general";

function subjectKind(subjectName?: string | null): SubjectKind {
  const n = (subjectName ?? "").toLowerCase();
  if (/physics|fisika/.test(n)) return "physics";
  if (/math|matematika/.test(n)) return "math";
  if (/biolog|chemistry|kimia|science|ipa/.test(n)) return "science";
  if (/english|inggris/.test(n)) return "english";
  if (/^gp$|global perspective/.test(n)) return "gp";
  if (/ict|informatika|computer|komputer/.test(n)) return "ict";
  return "general";
}

// Aturan metode/jawaban untuk soal hitungan (dipakai Fisika, Math, dan Science)
const CALCULATION_RULES = `For calculation questions, check method marks (e.g. "C" or "M" codes) and answer marks (e.g. "A" codes) SEPARATELY and STRICTLY:
   - A method mark for "states the formula" (e.g. "uses volume = mass/density") is awarded ONLY if the student writes that relationship as its own visible line — words or symbols like "volume = mass/density" or "V = m/ρ". Writing ONLY the numeric substitution (e.g. "110/7900 = 0.0139") does NOT satisfy a "states formula" mark.
   - CONCRETE EXAMPLE: mark scheme has C1 "states volume = mass/density" (1 mark), C2 "correct substitution 110/7900" (1 mark), A3 "0.014 m3" (1 mark). If the student writes only "110/7900 = 0.0139 m3" with no separate formula line, award C2 and A3 but NOT C1 (score 2/3).
   - Do NOT infer that a method step happened just because the final answer is correct. Award only the method marks whose specific step is visibly present in the working.
   - A student can get method marks even with a wrong final answer if the working shown is correct, and can get the answer mark via "error carried forward" if the mark scheme allows it — but never grant marks for skipped steps.
   - When in doubt whether a step was skipped or merely combined into one line, treat it as skipped and lower confidence to "medium".`;

function subjectRules(kind: SubjectKind): string {
  switch (kind) {
    case "physics":
      return `- Distinguish carefully between similar-but-wrong physics concepts (e.g. "heavier" vs "denser", "mass" vs "weight", "heat" vs "temperature") — common misconceptions must NOT receive credit unless the mark scheme explicitly accepts them.
- Check units where the mark scheme requires them.
- ${CALCULATION_RULES}`;
    case "math":
      return `- Award marks for correct mathematical working as specified by the mark scheme (M = method, A = accuracy, B = independent). Accept equivalent correct forms (e.g. 0.5 = 1/2) unless the mark scheme demands a specific form or degree of accuracy.
- ${CALCULATION_RULES}`;
    case "science":
      return `- Require correct scientific terminology where the mark scheme names a specific term (e.g. "osmosis" vs "diffusion", "cell membrane" vs "cell wall", "respiration" vs "breathing"). Confusing two related terms is a misconception and gets NO credit.
- Otherwise, accept answers that express the same scientific idea in the student's own words.
- For labelled diagrams or data/graph reading, follow the mark scheme exactly (correct label positions, values read within the stated tolerance).
- ${CALCULATION_RULES}`;
    case "english":
      return `- This is an English (language/literature) paper. Award credit when the student's answer conveys the meaning required by the mark scheme, even if worded differently — do not require word-for-word matches unless the mark scheme asks for a specific word or quotation.
- For questions that ask for evidence or a quotation from a text, credit only if the quoted/referenced evidence actually supports the point.
- Do NOT deduct marks for spelling or grammar unless the mark scheme explicitly assesses accuracy of language for that question.
- For extended writing marked with level/band descriptors, decide the best-fit level first, then the mark within that level, and briefly state which level descriptors were met in "reasoning".`;
    case "gp":
      return `- This is a Global Perspectives paper. Credit relevant points, explanations, evidence, and consideration of different perspectives as described in the mark scheme. Accept valid alternative points when the mark scheme allows "any reasonable answer" or similar.
- Distinguish between merely stating a point and explaining/developing it — award the higher mark only when the explanation is actually present.
- For level/band-marked questions, decide the best-fit level first, then the mark within that level.
- Do not deduct marks for spelling or grammar.`;
    case "ict":
      return `- Require correct ICT/computing terminology where the mark scheme names a specific term (e.g. "input device" vs "storage device", "RAM" vs "ROM"). Accept equivalent wording that clearly shows the same technical meaning.
- For "describe/explain" questions, the explanation must be present to earn the explanation mark — a single keyword alone only earns the "identify/state" mark.`;
    default:
      return `- Accept answers that convey the same meaning as the accepted answer, unless the mark scheme requires a specific term or form.
- ${CALCULATION_RULES}`;
  }
}

function buildSystemPrompt(subjectName?: string | null): string {
  const kind = subjectKind(subjectName);
  const subjectLabel = subjectName?.trim() || "subject";

  return `You are an experienced Cambridge examiner grading a student's handwritten ${subjectLabel} answer sheet. The student wrote their answers directly on the question paper itself, so you will receive MULTIPLE PAGE IMAGES in order (page 1, page 2, page 3, ...) — different questions and their answers may appear on different pages. Look across ALL provided pages to find each question's answer before scoring it; do not assume every question is on the first page.

RULES YOU MUST FOLLOW:
1. Read the handwritten answers carefully across all pages provided. Student answers are in English (Cambridge medium of instruction).
2. Grade STRICTLY according to the mark scheme provided — award marks only for content that matches an accepted answer, not for answers that merely sound plausible. Never award more than a question's maximum marks.
3. Subject-specific rules for ${subjectLabel}:
${subjectRules(kind)}
4. If handwriting is unclear, or a case is genuinely ambiguous, set confidence to "low" or "medium" and flag it for teacher review — do NOT guess silently.
5. If you can read a student name/identifier on ANY of the pages (often the first page), report it in student_name_read so the teacher can verify the match — but do not use it to influence scoring.
6. If a question's answer genuinely cannot be found on any provided page, score it 0, set confidence to "low", and note in flag_reason that no answer was found.
7. Keep the "reasoning" field for each question SHORT — one or two concise sentences maximum. Do not write long explanations; the teacher can always look at the photo for detail. Verbose reasoning risks running out of response space before you finish.
8. Respond ONLY with JSON matching the schema. When quoting a student's answer inside "reasoning", use single quotes, never double quotes.`;
}

function buildUserPrompt(
  questions: Question[],
  markSchemeItems: MarkSchemeItem[]
): string {
  const questionBlocks = questions
    .map((q) => {
      const items = markSchemeItems.filter((m) => m.question_id === q.id);
      const itemLines = items
        .map(
          (m) =>
            `  - [${m.mark_code ?? "M"}] (${m.points} mark${
              m.points > 1 ? "s" : ""
            }): ${m.accepted_answers}`
        )
        .join("\n");
      return `Question ${q.question_number} (max ${q.max_marks} marks)\nquestion_id (copy exactly into your JSON): ${q.id}${
        q.question_text ? `\nQuestion text: ${q.question_text}` : ""
      }\nMark scheme:\n${itemLines}`;
    })
    .join("\n\n");

  return `Grade the attached answer sheet (multiple page images, in order) against this mark scheme:

${questionBlocks}

Return JSON in exactly this shape:

{
  "student_name_read": string | null,
  "scores": [
    {
      "question_id": string,
      "question_number": string,
      "ai_score": number,
      "max_score": number,
      "marks_awarded": string[],
      "marks_missed": string[],
      "reasoning": string,
      "confidence": "high" | "medium" | "low",
      "flagged_for_review": boolean,
      "flag_reason": string | null
    }
  ]
}

CRITICAL: "question_id" is a long UUID string (like "a1b2c3d4-...") — copy it EXACTLY character-for-character from "Question <question_number> (max ...)" lines above, where it appears as internal metadata. Do NOT put the question_number (like "1(a)") into the question_id field — those are two different fields and must never be swapped. "question_number" is where "1(a)" style labels go.

Include one entry in "scores" for every question listed above, using its exact question_id.`;
}

// Skema JSON untuk structured outputs: API menjamin respons selalu
// JSON valid sesuai skema ini (didukung Sonnet 5.5 & Haiku 5.5).
const GRADING_SCHEMA = {
  type: "object",
  properties: {
    student_name_read: { type: ["string", "null"] },
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question_id: { type: "string" },
          question_number: { type: "string" },
          ai_score: { type: "number" },
          max_score: { type: "number" },
          marks_awarded: { type: "array", items: { type: "string" } },
          marks_missed: { type: "array", items: { type: "string" } },
          reasoning: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          flagged_for_review: { type: "boolean" },
          flag_reason: { type: ["string", "null"] },
        },
        required: [
          "question_id",
          "question_number",
          "ai_score",
          "max_score",
          "marks_awarded",
          "marks_missed",
          "reasoning",
          "confidence",
          "flagged_for_review",
          "flag_reason",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["student_name_read", "scores"],
  additionalProperties: false,
};

export async function gradeSubmission(
  input: GradeSubmissionInput
): Promise<GradingResponse> {
  const { images, questions, markSchemeItems, model, subjectName } = input;

  const imageBlocks = images.map((img) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: img.mediaType,
      data: img.base64,
    },
  }));

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model ?? DEFAULT_MODEL,
      max_tokens: 16000,
      system: buildSystemPrompt(subjectName),
      output_config: {
        format: { type: "json_schema", schema: GRADING_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: buildUserPrompt(questions, markSchemeItems),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const wasTruncated = data.stop_reason === "max_tokens";
  const truncatedMsg = `Respons AI terpotong sebelum selesai (jawaban terlalu panjang untuk batas yang ada). Coba lagi — kalau masih terjadi, kurangi jumlah halaman per grup upload atau hubungi Bapak Ramli untuk naikkan batas lebih tinggi lagi.`;

  const textBlock = data.content?.find((c: any) => c.type === "text");
  if (!textBlock?.text) {
    if (wasTruncated) throw new Error(truncatedMsg);
    throw new Error(
      `Claude API tidak mengembalikan hasil penilaian. stop_reason: ${data.stop_reason ?? "?"}`
    );
  }

  let parsed: GradingResponse;
  try {
    parsed = JSON.parse(extractJson(textBlock.text));
  } catch {
    if (wasTruncated) throw new Error(truncatedMsg);
    throw new Error(
      `Failed to parse Claude response as JSON: ${textBlock.text.slice(
        0,
        300
      )}`
    );
  }

  // Jaga-jaga: skor AI tidak boleh negatif atau melebihi nilai maksimal soal
  const maxById = new Map(questions.map((q) => [q.id, q.max_marks]));
  parsed.scores = (parsed.scores ?? []).map((sc) => {
    const max = Number(maxById.get(sc.question_id) ?? sc.max_score);
    let score = Math.max(0, Number(sc.ai_score) || 0);
    if (Number.isFinite(max) && max > 0) score = Math.min(score, max);
    return { ...sc, ai_score: score };
  });

  return parsed;
}

// Model baru (Sonnet/Haiku 5.5) kadang membungkus JSON dengan ```json ... ```
// atau menambah kalimat pembuka. Ambil hanya bagian objek JSON-nya.
export function extractJson(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end > start) t = t.slice(start, end + 1);
  return t;
}
