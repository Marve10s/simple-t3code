const CHUNK_RELOAD_GUARD_KEY = "t3code:chunk-load-reloaded";

export function reloadOnceForChunkLoadError(
  getStorage: () => Storage = () => window.sessionStorage,
  reload: () => void = () => window.location.reload(),
): boolean {
  let alreadyReloaded: boolean;
  try {
    const storage = getStorage();
    alreadyReloaded = storage.getItem(CHUNK_RELOAD_GUARD_KEY) === "1";
    if (!alreadyReloaded) storage.setItem(CHUNK_RELOAD_GUARD_KEY, "1");
  } catch {
    return false;
  }
  if (alreadyReloaded) return false;
  reload();
  return true;
}

export function clearChunkReloadGuard(getStorage: () => Storage = () => window.sessionStorage) {
  try {
    getStorage().removeItem(CHUNK_RELOAD_GUARD_KEY);
  } catch {}
}
