"use client";

import { useEffect, useState } from "react";

// Total skor siswa di halaman Review. Ikut berubah langsung saat guru
// mengetik nilai Override (sebelum disimpan).
export default function LiveTotal({
  formId,
  aiTotal,
  initialTotal,
  maxTotal,
}: {
  formId: string;
  aiTotal: number;
  initialTotal: number;
  maxTotal: number;
}) {
  const [total, setTotal] = useState(initialTotal);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    function recompute() {
      const fd = new FormData(form!);
      let sum = 0;
      for (const id of fd.getAll("scoreId") as string[]) {
        const ai = parseFloat((fd.get(`aiScore-${id}`) as string) ?? "0") || 0;
        const ovRaw = ((fd.get(`override-${id}`) as string) ?? "").trim();
        const max = parseFloat((fd.get(`max-${id}`) as string) ?? "");
        let v = ovRaw !== "" ? parseFloat(ovRaw) : ai;
        if (Number.isNaN(v)) v = ai;
        if (v < 0) v = 0;
        if (!Number.isNaN(max) && v > max) v = max;
        sum += v;
      }
      sum = Math.round(sum * 100) / 100;
      setTotal(sum);
      setDirty(sum !== initialTotal);
    }

    form.addEventListener("input", recompute);
    return () => form.removeEventListener("input", recompute);
  }, [formId, initialTotal]);

  const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : null;
  const changedFromAi = total !== aiTotal;

  return (
    <div className="text-right">
      <p className="text-sm font-semibold text-gray-900">
        Total: {total}/{maxTotal}
        {pct != null && <span className="ml-1 font-normal text-gray-500">({pct}%)</span>}
      </p>
      {changedFromAi && (
        <p className="text-[11px] text-gray-500">AI: {aiTotal}/{maxTotal}</p>
      )}
      {dirty && <p className="text-[11px] text-amber-600">Belum disimpan</p>}
    </div>
  );
}
