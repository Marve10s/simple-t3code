import type { File } from "expo-file-system";

let tempFileSequence = 0;

export async function writeFileAtomically(file: File, contents: string): Promise<void> {
  const { File: FileConstructor } = await import("expo-file-system");
  tempFileSequence += 1;
  const temp = new FileConstructor(file.parentDirectory, `${file.name}.${tempFileSequence}.tmp`);
  temp.create({ intermediates: true, overwrite: true });
  temp.write(contents);
  temp.moveSync(file, { overwrite: true });
}
