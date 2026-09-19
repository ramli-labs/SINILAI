"use client";

import { useState } from "react";
import PhotoUpload from "@/components/PhotoUpload";
import BulkPhotoUpload from "@/components/BulkPhotoUpload";

interface Student {
  id: string;
  roll_number: number;
  full_name: string;
}

export default function UploadModeTabs({
  examId,
  students,
}: {
  examId: string;
  students: Student[];
}) {
  const [mode, setMode] = useState<"single" | "bulk">("bulk");

  return (
    <div>
      <div className="mb-3 flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("bulk")}
          className={`rounded-md px-3 py-1 ${
            mode === "bulk" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          Upload Banyak Sekaligus
        </button>
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`rounded-md px-3 py-1 ${
            mode === "single" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          Upload Satu-Satu
        </button>
      </div>

      {mode === "single" ? (
        <PhotoUpload examId={examId} students={students} />
      ) : (
        <BulkPhotoUpload examId={examId} students={students} />
      )}
    </div>
  );
}
