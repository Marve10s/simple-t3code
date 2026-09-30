// @effect-diagnostics nodeBuiltinImport:off -- One-time synchronous copy before the backend opens its database.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

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
