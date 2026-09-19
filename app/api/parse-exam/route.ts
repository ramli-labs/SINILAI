// app/api/parse-exam/route.ts
// Endpoint: terima file docx soal (wajib) & mark scheme (opsional), ekstrak
// teksnya, lalu minta Claude mengurai jadi format Q:/MS: yang dipahami
// form "Ujian Baru" — supaya guru tidak perlu ngetik manual.

import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You are helping a teacher digitize a Cambridge-style exam question paper and its mark scheme into a structured plain-text format for an AI grading system.

You will receive raw extracted text from a question paper document, and usually also a separate mark scheme document.

Produce output in EXACTLY this format — nothing else, no commentary, no markdown code fences:

Q: <question number, e.g. 1(a)> | <max marks as a whole number> | <short question text>
MS: <mark code, e.g. B1/C1/C2/A3/M1> | <points for this line, whole number> | <accepted answer description>
MS: <next mark scheme line for the same question, if any>

(leave one blank line between question blocks)

RULES:
1. One Q: block per sub-question (e.g. 1(a), 1(b), 2(a)(i)), each followed by one or more MS: lines.
2. Use the exact mark codes from the mark scheme document if present (B1, C1, C2, A3, M1, etc). If the mark scheme has no explicit codes, invent sequential ones like M1, M2 per question.
3. The sum of the MS: line points for a question MUST equal that question's max marks from the Q: line.
4. Keep question text short — one sentence capturing what is asked, not the full original wording with diagrams/instructions.
5. Preserve numeric values, units, and technical content in the mark scheme EXACTLY as given — do not paraphrase accepted numeric answers or formulas.
6. If the mark scheme text is messy (extracted from a table), extract just the actual accepted-answer content per question, ignoring table artifacts like repeated headers.
7. If no separate mark scheme document was provided, infer a reasonable mark scheme from the question paper's own mark allocations, using generic M1/M2 codes and best-effort accepted-answer descriptions based on standard subject knowledge — and note in the question text if a part is uncertain.
8. Output ONLY the Q:/MS: blocks. No preamble, no summary, no explanation.`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const qpFile = formData.get("qp") as File | null;
    const msFile = formData.get("ms") as File | null;

    if (!qpFile) {
      return NextResponse.json(
        { error: "File soal (question paper) wajib diupload" },
        { status: 400 }
      );
    }

    async function extractText(file: File): Promise<string> {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    const qpTextRaw = await extractText(qpFile);
    const msTextRaw = msFile ? await extractText(msFile) : null;

    // Batasi panjang teks yang dikirim — dokumen Word dengan tabel kompleks
    // bisa menghasilkan ekstraksi teks yang sangat panjang (whitespace/baris
    // berulang), yang memboroskan token tanpa menambah informasi berguna.
    const MAX_CHARS = 15000;
    const qpText = qpTextRaw.slice(0, MAX_CHARS);
    const msText = msTextRaw ? msTextRaw.slice(0, MAX_CHARS) : null;

    const userPrompt = `Question paper text:\n\n${qpText}\n\n${
      msText
        ? `Mark scheme text:\n\n${msText}`
        : "(No separate mark scheme document was provided — infer one from the question paper's mark allocations.)"
    }\n\nProduce the Q:/MS: formatted output now, covering every question and sub-question in the paper.`;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find((c: any) => c.type === "text");

    if (!textBlock?.text) {
      throw new Error(
        `Claude tidak mengembalikan teks. stop_reason: ${data.stop_reason ?? "?"}, content types: ${
          (data.content ?? []).map((c: any) => c.type).join(",") || "(kosong)"
        }`
      );
    }

    return NextResponse.json({ questionsRaw: textBlock.text.trim() });
  } catch (err: any) {
    console.error("Parse exam error:", err);
    return NextResponse.json(
      { error: err.message ?? "Gagal mengurai dokumen" },
      { status: 500 }
    );
  }
}
