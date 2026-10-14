// lib/photos.ts
// Foto lembar jawaban di Supabase Storage (bucket privat "submission-photos").
// - Yang disimpan di database/dikirim antar halaman adalah PATH file
//   (misal "<examId>/bulk-1697...-0-p1.jpg"), bukan URL publik.
// - Server membaca foto dengan service role, lalu menghapusnya setelah
//   nilai tersimpan (kebijakan privasi).

import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_BUCKET = "submission-photos";

type ImageInput = {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
};

// Terima path atau URL lama (.../object/public/submission-photos/<path>)
export function toPhotoPath(urlOrPath: string): string {
  const marker = `/${PHOTO_BUCKET}/`;
  const i = urlOrPath.indexOf(marker);
  const path = i >= 0 ? urlOrPath.slice(i + marker.length) : urlOrPath;
  return decodeURIComponent(path.split("?")[0]).replace(/^\/+/, "");
}

// Pastikan semua foto berada di folder ujian ini (cegah membaca file lain)
export function photosBelongToExam(paths: string[], examId: string): boolean {
  return paths.every((p) => {
    const path = toPhotoPath(p);
    return path.startsWith(`${examId}/`) && !path.includes("..");
  });
}

function guessMediaType(path: string, blobType: string): ImageInput["mediaType"] {
  if (blobType === "image/png" || blobType === "image/webp" || blobType === "image/jpeg") {
    return blobType;
  }
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "image/jpeg";
}

export async function downloadPhotos(
  svc: SupabaseClient,
  urlsOrPaths: string[]
): Promise<ImageInput[]> {
  return Promise.all(
    urlsOrPaths.map(async (u) => {
      const path = toPhotoPath(u);
      const { data, error } = await svc.storage.from(PHOTO_BUCKET).download(path);
      if (error || !data) {
        throw new Error(`Gagal membaca foto ${path}: ${error?.message ?? "tidak ditemukan"}`);
      }
      const buffer = Buffer.from(await data.arrayBuffer());
      return { base64: buffer.toString("base64"), mediaType: guessMediaType(path, data.type) };
    })
  );
}

// Hapus file foto. Tidak melempar error — kegagalan hapus tidak boleh
// membatalkan nilai yang sudah tersimpan.
export async function deletePhotos(svc: SupabaseClient, urlsOrPaths: string[] | null | undefined) {
  if (!urlsOrPaths || urlsOrPaths.length === 0) return;
  const paths = urlsOrPaths.map(toPhotoPath);
  const { error } = await svc.storage.from(PHOTO_BUCKET).remove(paths);
  if (error) console.error("Gagal hapus foto:", error.message);
}
