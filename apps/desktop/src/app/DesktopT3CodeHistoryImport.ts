// @effect-diagnostics nodeBuiltinImport:off -- One-time synchronous copy before the backend opens its database.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

/**
 * SimpleT3Code keeps its own home (~/.simplet3) because two servers must never
 * share one event store. On first launch it inherits T3 Code's history with a
 * snapshot of ~/.t3/userdata; later T3 Code activity is not synced.
 *
 * VACUUM INTO reads a consistent snapshot even while T3 Code has the database
 * open, and the copy lands under a temporary name so an interrupted import
 * never leaves a half-written database behind.
 */
export function importT3CodeHistory(input: {
  readonly homeDirectory: string;
  readonly stateDir: string;
}): { readonly imported: boolean; readonly reason: string } {
  const sourceDir = NodePath.join(input.homeDirectory, ".t3", "userdata");
  const sourceDatabase = NodePath.join(sourceDir, "state.sqlite");
  const targetDatabase = NodePath.join(input.stateDir, "state.sqlite");
  if (NodeFS.existsSync(targetDatabase)) {
    return { imported: false, reason: "SimpleT3Code already has history" };
  }
  if (!NodeFS.existsSync(sourceDatabase)) {
    return { imported: false, reason: "no T3 Code history found" };
  }

  NodeFS.mkdirSync(input.stateDir, { recursive: true });
  const partialDatabase = `${targetDatabase}.importing`;
  NodeFS.rmSync(partialDatabase, { force: true });
  const source = new NodeSqlite.DatabaseSync(sourceDatabase, { readOnly: true });
  try {
    source.exec(`VACUUM INTO '${partialDatabase.replaceAll("'", "''")}'`);
  } finally {
    source.close();
  }
  NodeFS.renameSync(partialDatabase, targetDatabase);

  // Message attachments and user preferences travel with the history. The
  // environment identity and secrets stay per-app so both apps can run side
  // by side as distinct environments.
  for (const file of ["settings.json", "keybindings.json"]) {
    const source = NodePath.join(sourceDir, file);
    const target = NodePath.join(input.stateDir, file);
    if (NodeFS.existsSync(source) && !NodeFS.existsSync(target)) {
      NodeFS.copyFileSync(source, target);
    }
  }
  const sourceAttachments = NodePath.join(sourceDir, "attachments");
  if (NodeFS.existsSync(sourceAttachments)) {
    NodeFS.cpSync(sourceAttachments, NodePath.join(input.stateDir, "attachments"), {
      recursive: true,
      force: false,
    });
  }
  return { imported: true, reason: "copied T3 Code history" };
}
