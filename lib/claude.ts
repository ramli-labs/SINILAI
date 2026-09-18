// lib/claude.ts
// Wrapper untuk memanggil Claude API dan menilai jawaban siswa
// sesuai mark scheme, mengikuti pola yang sudah divalidasi manual
// untuk Fisika Mid Term 1 (kode marking B1/C1/C2/A3 ala Cambridge).

import type { MarkSchemeItem, Question } from "./types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

export interface QuestionScoreResult {
  question_id: string;
  question_number: string;
  ai_score: number;
  max_score: number;
  marks_awarded: string[]; // contoh: ["B1", "C2"] — kode yang terpenuhi
  marks_missed: string[]; // contoh: ["C1"] — kode yang tidak terpenuhi
  reasoning: string; // penjelasan singkat kenapa dapat/tidak dapat tiap kode
  confidence: "high" | "medium" | "low";
  flagged_for_review: boolean;
  flag_reason?: string;
}

export interface GradingResponse {
  student_name_read: string | null; // nama yang terbaca AI dari foto, untuk verifikasi
  scores: QuestionScoreResult[];
}

interface GradeSubmissionInput {
  imageBase64: string; // foto jawaban siswa, base64 tanpa prefix data URI
  imageMediaType: "image/jpeg" | "image/png" | "image/webp";
  questions: Question[];
  markSchemeItems: MarkSchemeItem[]; // semua item mark scheme untuk questions di atas
}

function buildSystemPrompt(): string {
  return `You are an experienced Cambridge IGCSE examiner grading a student's handwritten physics answer sheet.

RULES YOU MUST FOLLOW:
1. Read the handwritten answers carefully. Student answers are in English (Cambridge medium of instruction).
2. Grade STRICTLY according to the mark scheme provided — award marks only for content that matches an accepted answer, not for answers that merely sound plausible.
3. Distinguish carefully between similar-but-wrong physics concepts (e.g. "heavier" vs "denser", "mass" vs "weight") — these are common misconceptions and must NOT receive credit unless the mark scheme explicitly accepts them.
4. For calculation questions, check method marks (e.g. "C" codes) and answer marks (e.g. "A" codes) SEPARATELY and STRICTLY:
   - A method mark for "states the formula" (e.g. "uses volume = mass/density") is awarded ONLY if the student writes that relationship as its own visible line — words or symbols like "volume = mass/density" or "V = m/ρ". Writing ONLY the numeric substitution (e.g. "110/7900 = 0.0139") does NOT satisfy a "states formula" mark, even though the calculation is mathematically using that formula — the formula itself was never written down.
   - CONCRETE EXAMPLE: mark scheme has C1 "states volume = mass/density" (1 mark), C2 "correct substitution 110/7900" (1 mark), A3 "0.014 m3" (1 mark). If the student writes only "110/7900 = 0.0139 m3" with no separate formula line, award C2 and A3 but NOT C1 (score 2/3) — do not award C1 just because the substitution proves the formula was used mentally.
   - Do NOT infer or assume a method step happened just because the final numeric substitution or answer is correct. A correct final answer does NOT imply every method mark — award only the method marks whose specific step is visibly present in the student's working.
   - A student can get method marks even with a wrong final answer if the working shown is correct, and can also get the final answer mark via an "error carried forward" from an earlier mistake if the mark scheme allows it — but never grant marks for steps that were skipped.
   - When in doubt whether a step was skipped or merely combined into one line, treat it as skipped (do not award it), and lower confidence to "medium" for that item rather than silently granting the mark.
5. If handwriting is unclear, or a case is genuinely ambiguous (e.g. a method mark that is implied but not explicitly written), set confidence to "low" or "medium" and flag it for teacher review — do NOT guess silently.
6. If you can read a student name/identifier on the sheet, report it in student_name_read so the teacher can verify the match — but do not use it to influence scoring.
7. Respond ONLY with valid JSON matching the exact schema given in the user message. No preamble, no markdown fences, no explanation outside the JSON.`;
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
      return `Question ${q.question_number} (max ${q.max_marks} marks)${
        q.question_text ? `\nQuestion text: ${q.question_text}` : ""
      }\nMark scheme:\n${itemLines}`;
    })
    .join("\n\n");

  return `Grade the attached answer sheet image against this mark scheme:

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

Include one entry in "scores" for every question listed above, using its exact question_id.`;
}

export async function gradeSubmission(
  input: GradeSubmissionInput
): Promise<GradingResponse> {
  const { imageBase64, imageMediaType, questions, markSchemeItems } = input;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: imageMediaType,
                data: imageBase64,
              },
            },
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
  const textBlock = data.content?.find((c: any) => c.type === "text");

  if (!textBlock?.text) {
    throw new Error("Claude API returned no text content");
  }

  let parsed: GradingResponse;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new Error(
      `Failed to parse Claude response as JSON: ${textBlock.text.slice(
        0,
        300
      )}`
    );
  }

  return parsed;
}
