"use client";

import { useFormStatus } from "react-dom";
import { useBulkLock } from "@/lib/bulkLock";

export default function SubmitButton({
  children,
  pendingText,
  className,
}: {
  children: React.ReactNode;
  pendingText: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const bulkLocked = useBulkLock();

  return (
    <button
      type="submit"
      disabled={pending || bulkLocked}
      title={bulkLocked ? "Tunggu proses AI selesai dulu" : undefined}
      className={
        className ??
        "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      }
    >
      {pending ? pendingText : bulkLocked ? "Tunggu proses AI..." : children}
    </button>
  );
}
