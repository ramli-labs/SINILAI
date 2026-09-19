"use client";

import * as XLSX from "xlsx";

export default function ExportExcelButton({
  data,
  filename,
  sheetName,
}: {
  data: Record<string, any>[];
  filename: string;
  sheetName: string;
}) {
  function handleExport() {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
    >
      Export ke Excel
    </button>
  );
}
