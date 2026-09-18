# Sistem Koreksi Jawaban Ujian AI

MVP: 1 kelas (7A Cambridge), mapel Fisika, model Claude Sonnet 5.

## Cara Menjalankan

### 1. Setup Supabase
1. Buat project baru di https://supabase.com (gratis)
2. Buka **SQL Editor**, jalankan seluruh isi `supabase/schema.sql`
3. Buka **Storage**, buat bucket baru bernama `submission-photos` (set sebagai **public** supaya foto bisa dibaca API grading — foto otomatis dihapus referensinya setelah dinilai)
4. Buka **Project Settings > API**, salin:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (rahasia, jangan expose ke browser)

### 2. Setup Anthropic API
1. Daftar di https://console.anthropic.com
2. Buat API key baru → isi ke `ANTHROPIC_API_KEY`
3. Isi saldo (top-up kecil, $5-10 cukup untuk beberapa bulan pemakaian skala 1 kelas)

### 3. Jalankan Lokal
```bash
cp .env.example .env.local
# isi semua variabel di .env.local

npm install
npm run dev
```
Buka http://localhost:3000 → daftar akun guru pertama di `/register`.

### 4. Deploy ke Vercel
1. Push repo ini ke GitHub
2. Import project di https://vercel.com dari repo GitHub tersebut
3. Isi environment variables yang sama seperti `.env.local` di pengaturan project Vercel
4. Deploy — otomatis update tiap `git push` berikutnya

## Alur Pemakaian

1. Guru daftar/login
2. Buat kelas → tempel daftar siswa (nama + L/P, urutan = nomor absen)
3. Buat ujian → pilih mapel & kelas → isi soal + mark scheme (format `Q:` dan `MS:`, lihat placeholder di form)
4. Upload foto jawaban per siswa → AI otomatis membaca & menilai sesuai mark scheme
5. Review hasil → guru bisa override skor sebelum menyetujui nilai akhir

## Struktur Kode

Lihat `PROJECT-STRUCTURE.md` (dari chat sebelumnya) untuk penjelasan folder lengkap.

## Belum Diimplementasikan (Tahap Selanjutnya)

- Multi-mapel dengan model routing otomatis (Haiku vs Sonnet per mapel)
- Redaksi otomatis nama siswa dari foto sebelum dikirim ke API
- Auto-hapus file di Supabase Storage (saat ini hanya `photo_url` di database yang dikosongkan, file fisik di bucket perlu dihapus manual atau tambahkan `supabase.storage.from(...).remove()` di `app/api/grade/route.ts`)
- Dashboard analitik (misal deteksi miskonsepsi berulang di satu kelas)
