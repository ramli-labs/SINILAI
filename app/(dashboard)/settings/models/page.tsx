import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";

const MODEL_OPTIONS = [
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (lebih murah, cocok untuk soal sederhana)" },
  { value: "claude-sonnet-5", label: "Sonnet 5 (lebih teliti, disarankan untuk esai/penalaran)" },
];

async function updateModelsAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: subjects } = await supabase.from("subjects").select("id");

  for (const s of subjects ?? []) {
    const selectedModel = formData.get(`model-${s.id}`) as string;
    if (!selectedModel) continue;
    await supabase
      .from("subjects")
      .update({ default_model: selectedModel })
      .eq("id", s.id);
  }

  redirect("/settings/models?saved=1");
}

export default async function ModelSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const supabase = await createClient();

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name, default_model")
    .order("name");

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-lg font-semibold">Pengaturan Model AI per Mapel</h1>
      <p className="mb-4 text-sm text-gray-500">
        Pilih model AI untuk tiap mapel. Sonnet 5 lebih teliti tapi lebih
        mahal — cocok untuk mapel dengan jawaban esai/penalaran panjang
        (Biologi, English, GP). Haiku 4.5 lebih murah — cocok untuk soal
        yang jawabannya lebih terstruktur (Fisika, Math, ICT).
      </p>

      {saved === "1" && (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Pengaturan tersimpan. Ujian yang sudah dinilai TIDAK dinilai ulang
          otomatis — ini cuma berlaku untuk penilaian berikutnya.
        </p>
      )}

      <form action={updateModelsAction} className="space-y-3">
        {subjects?.map((s) => (
          <div
            key={s.id}
            className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
          >
            <label className="mb-1 block text-sm font-medium">{s.name}</label>
            <select
              name={`model-${s.id}`}
              defaultValue={s.default_model}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        <SubmitButton pendingText="Menyimpan...">Simpan Pengaturan</SubmitButton>
      </form>
    </div>
  );
}
