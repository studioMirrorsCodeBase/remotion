// app/shared.ts
// NEW FILE (to be created)

// Shared by the editor tab and the preview tab
import natasja from "../scripts/natasja.json";

export const CHANNEL = "comic-spec"; // tabs of this site talk on this channel: {type: "json", text} or {type: "video"}
export const STORE_KEY = "comic-spec-json"; // last good JSON, so a freshly opened preview tab has something to show
export const DEFAULT_TEXT = JSON.stringify(natasja, null, 2);

// The video the user picked is kept in the browser (IndexedDB), so the other tab can read it and a reload does not lose it.
const open = () =>
  new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open("comic-video", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

export const saveVideo = async (file: File): Promise<void> => {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, "video");
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  console.log(`[Shared] video saved in the browser: ${file.name}, ${(file.size / 1e6).toFixed(1)} MB`);
};

export const loadVideo = async (): Promise<File | null> => {
  const db = await open();
  return new Promise((res, rej) => {
    const r = db.transaction("files").objectStore("files").get("video");
    r.onsuccess = () => res((r.result as File | undefined) ?? null);
    r.onerror = () => rej(r.error);
  });
};