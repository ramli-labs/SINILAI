"use client";

export default function DeleteExamButton({
  examId,
  examTitle,
  deleteAction,
}: {
  examId: string;
  examTitle: string;
  deleteAction: (formData: FormData) => void;
}) {
  return (
    <form
      action={deleteAction}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Yakin mau hapus ujian "${examTitle}"? Semua soal, mark scheme, foto, dan nilai yang sudah tersimpan untuk ujian ini akan ikut terhapus PERMANEN. Tindakan ini tidak bisa dibatalkan.`
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="examId" value={examId} />
      <button
        type="submit"
        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Hapus Ujian
      </button>
    </form>
  );
}
