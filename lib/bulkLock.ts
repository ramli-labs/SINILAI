// lib/bulkLock.ts
// Penanda global "proses massal sedang berjalan" di sisi browser.
// Dipakai untuk mengunci tombol Simpan selama "Perbarui semua deskripsi"
// berjalan, supaya isi kotak deskripsi yang lama tidak menimpa hasil AI.

import { useSyncExternalStore } from "react";

let locked = false;
const listeners = new Set<() => void>();

export function setBulkLock(value: boolean) {
  locked = value;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBulkLock(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => locked,
    () => false
  );
}
