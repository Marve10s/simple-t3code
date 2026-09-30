import { useEffect, useState } from "react";

import { randomUUID } from "../../lib/utils";
import type { CodexBackground } from "./codexBackgrounds";

/**
 * Images the user adds for new-chat backgrounds. They stay on this device in
 * IndexedDB, downscaled once on import so a large photo never costs more than
 * a screen-sized image to decode.
 */
const DATABASE_NAME = "simplet3code-backgrounds";
const STORE_NAME = "images";
const MAX_EDGE = 2560;
const CHANGE_EVENT = "simplet3code:backgrounds-changed";

interface StoredBackground {
  readonly id: string;
  readonly name: string;
  readonly blob: Blob;
  readonly createdAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
  } finally {
    database.close();
  }
}

async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(
    Math.round(bitmap.width * scale),
    Math.round(bitmap.height * scale),
  );
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
}

export async function addCustomBackgrounds(files: ReadonlyArray<File>): Promise<void> {
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const record: StoredBackground = {
      id: `custom-${randomUUID()}`,
      name: file.name.replace(/\.[^.]+$/, ""),
      blob: await downscale(file),
      createdAt: Date.now(),
    };
    await withStore("readwrite", (store) => store.put(record));
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export async function removeCustomBackground(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The user's own backgrounds, as object URLs that live while the hook is mounted. */
export function useCustomBackgrounds(): ReadonlyArray<CodexBackground> {
  const [backgrounds, setBackgrounds] = useState<ReadonlyArray<CodexBackground>>([]);

  useEffect(() => {
    let urls: string[] = [];
    let cancelled = false;
    const load = async () => {
      const records = await withStore<StoredBackground[]>("readonly", (store) => store.getAll());
      if (cancelled) return;
      for (const url of urls) URL.revokeObjectURL(url);
      urls = [];
      setBackgrounds(
        records
          .toSorted((left, right) => left.createdAt - right.createdAt)
          .map((record) => {
            const url = URL.createObjectURL(record.blob);
            urls.push(url);
            return {
              id: record.id,
              src: url,
              thumbnail: url,
              title: record.name,
              credit: "Your image",
              sourceUrl: "",
            };
          }),
      );
    };
    void load().catch((error) => console.error("Could not load custom backgrounds.", error));
    const onChange = () => void load().catch(() => undefined);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(CHANGE_EVENT, onChange);
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  return backgrounds;
}
