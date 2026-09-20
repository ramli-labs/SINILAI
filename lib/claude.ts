// lib/claude.ts
// Wrapper untuk memanggil Claude API dan menilai jawaban siswa
// sesuai mark scheme, mengikuti pola yang sudah divalidasi manual
// untuk Fisika Mid Term 1 (kode marking B1/C1/C2/A3 ala Cambridge).

import type { MarkSchemeItem, Question } from "./types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";

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
}

function buildSystemPrompt(): string {
  return `You are an experienced Cambridge IGCSE examiner grading a student's handwritten physics answer sheet. The student wrote their answers directly on the question paper itself, so you will receive MULTIPLE PAGE IMAGES in order (page 1, page 2, page 3, ...) — different questions and their answers may appear on different pages. Look across ALL provided pages to find each question's answer before scoring it; do not assume every question is on the first page.

RULES YOU MUST FOLLOW:
1. Read the handwritten answers carefully across all pages provided. Student answers are in English (Cambridge medium of instruction).
2. Grade STRICTLY according to the mark scheme provided — award marks only for content that matches an accepted answer, not for answers that merely sound plausible.
3. Distinguish carefully between similar-but-wrong physics concepts (e.g. "heavier" vs "denser", "mass" vs "weight") — these are common misconceptions and must NOT receive credit unless the mark scheme explicitly accepts them.
4. For calculation questions, check method marks (e.g. "C" codes) and answer marks (e.g. "A" codes) SEPARATELY and STRICTLY:
   - A method mark for "states the formula" (e.g. "uses volume = mass/density") is awarded ONLY if the student writes that relationship as its own visible line — words or symbols like "volume = mass/density" or "V = m/ρ". Writing ONLY the numeric substitution (e.g. "110/7900 = 0.0139") does NOT satisfy a "states formula" mark, even though the calculation is mathematically using that formula — the formula itself was never written down.
   - CONCRETE EXAMPLE: mark scheme has C1 "states volume = mass/density" (1 mark), C2 "correct substitution 110/7900" (1 mark), A3 "0.014 m3" (1 mark). If the student writes only "110/7900 = 0.0139 m3" with no separate formula line, award C2 and A3 but NOT C1 (score 2/3) — do not award C1 just because the substitution proves the formula was used mentally.
   - Do NOT infer or assume a method step happened just because the final numeric substitution or answer is correct. A correct final answer does NOT imply every method mark — award only the method marks whose specific step is visibly present in the student's working.
   - A student can get method marks even with a wrong final answer if the working shown is correct, and can also get the final answer mark via an "error carried forward" from an earlier mistake if the mark scheme allows it — but never grant marks for steps that were skipped.
   - When in doubt whether a step was skipped or merely combined into one line, treat it as skipped (do not award it), and lower confidence to "medium" for that item rather than silently granting the mark.
5. If handwriting is unclear, or a case is genuinely ambiguous (e.g. a method mark that is implied but not explicitly written), set confidence to "low" or "medium" and flag it for teacher review — do NOT guess silently.
6. If you can read a student name/identifier on ANY of the pages (often the first page), report it in student_name_read so the teacher can verify the match — but do not use it to influence scoring.
7. If a question's answer genuinely cannot be found on any provided page, score it 0, set confidence to "low", and note in flag_reason that no answer was found.
8. Respond ONLY with valid JSON matching the exact schema given in the user message. No preamble, no markdown fences, no explanation outside the JSON.`;
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

export async function gradeSubmission(
  input: GradeSubmissionInput
): Promise<GradingResponse> {
  const { images, questions, markSchemeItems, model } = input;

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
      max_tokens: 4000,
      system: buildSystemPrompt(),
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
