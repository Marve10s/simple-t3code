export const CLI_RUNTIME_EXTERNAL_PREFIXES = [
  "node-pty",
  "ffi-rs",
  "@yuuang/",
  "@ff-labs/",
  "@napi-rs/keyring",
  "@clerk/electron-passkeys",
  "node-gyp-build",
  "node-addon-api",
  "bufferutil",
  "utf-8-validate",
] as const;

export function isRuntimeExternalCliDependency(id: string): boolean {
  return CLI_RUNTIME_EXTERNAL_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export function isExternalCliDependency(id: string): boolean {
  return isRuntimeExternalCliDependency(id);
}

export function shouldBundleCliDependency(id: string): boolean {
  if (id.startsWith("node:")) return false;
  return !isExternalCliDependency(id);
}

export function selectCliRuntimeExternalDependencies(
  dependencies: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(dependencies).filter(([name]) => isRuntimeExternalCliDependency(name)),
  );
}

export function findInlinedExternalPackages(source: string): {
  readonly regionCount: number;
  readonly inlined: ReadonlyArray<string>;
  readonly inlinedPackages: ReadonlyArray<string>;
} {
  const regionPattern = /\/\/#region\s+(\S+)/g;
  const packagePattern = /node_modules\/((?:@[^/\s]+\/)?[^/\s]+)\//g;

  let regionCount = 0;
  const inlined = new Set<string>();
  const inlinedPackages = new Set<string>();
  for (const region of source.matchAll(regionPattern)) {
    regionCount += 1;
    const regionPath = region[1] ?? "";
    for (const candidate of regionPath.matchAll(packagePattern)) {
      const name = candidate[1];
      if (name === undefined || name === ".pnpm") continue;
      inlinedPackages.add(name);
      if (isExternalCliDependency(name)) inlined.add(name);
    }
  }

  return {
    regionCount,
    inlined: [...inlined].sort(),
    inlinedPackages: [...inlinedPackages].sort(),
  };
}
