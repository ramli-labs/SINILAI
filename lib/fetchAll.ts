// lib/fetchAll.ts
// Supabase (PostgREST) membatasi hasil query maksimal 1000 baris secara
// default. Helper ini mengambil data per halaman sampai habis, supaya
// laporan/ringkasan/review tidak diam-diam terpotong.

const PAGE_SIZE = 1000;

export async function fetchAllRows<T = any>(
  buildQuery: () => any
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery()
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}
