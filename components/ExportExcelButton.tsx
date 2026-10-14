"use client";

import * as XLSX from "xlsx";

type Sheet = { name: string; data: Record<string, any>[]; colWidths?: number[] };

export default function ExportExcelButton({
  data,
  filename,
  sheetName,
  colWidths,
  extraSheets = [],
}: {
  data: Record<string, any>[];
  filename: string;
  sheetName: string;
  colWidths?: number[];
  extraSheets?: Sheet[];
}) {
  function handleExport() {
    const workbook = XLSX.utils.book_new();
    const sheets: Sheet[] = [{ name: sheetName, data, colWidths }, ...extraSheets];
    for (const sh of sheets) {
      const ws = XLSX.utils.json_to_sheet(sh.data);
      if (sh.colWidths) ws["!cols"] = sh.colWidths.map((wch) => ({ wch }));
      // Baris judul bisa difilter
      if (ws["!ref"]) ws["!autofilter"] = { ref: ws["!ref"] };
      XLSX.utils.book_append_sheet(workbook, ws, sh.name);
    }
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
