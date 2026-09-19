"use client";

export default function DeleteClassButton({
  classId,
  className,
  studentCount,
  examCount,
  deleteAction,
}: {
  classId: string;
  className: string;
  studentCount: number;
  examCount: number;
  deleteAction: (formData: FormData) => void;
}) {
  return (
    <form
      action={deleteAction}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Yakin mau hapus kelas "${className}"? Ini akan menghapus PERMANEN ${studentCount} siswa, ${examCount} ujian, beserta semua soal, mark scheme, dan nilai yang sudah tersimpan. Tindakan ini tidak bisa dibatalkan.`
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="classId" value={classId} />
      <button
        type="submit"
        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Hapus Kelas
      </button>
    </form>
  );
}
