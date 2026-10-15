// Pendaftaran bebas ditutup — akun guru dibuat oleh admin lewat menu "Kelola Guru".
export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="mb-2 text-xl font-semibold">Pendaftaran ditutup</h1>
        <p className="text-sm text-gray-600">
          Akun guru dibuat oleh admin sekolah. Silakan hubungi admin untuk mendapatkan akun, lalu{" "}
          <a href="/login" className="text-blue-600 hover:underline">
            masuk di sini
          </a>
          .
        </p>
      </div>
    </div>
  );
}
