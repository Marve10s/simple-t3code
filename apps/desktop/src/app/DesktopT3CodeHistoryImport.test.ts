// @effect-diagnostics nodeBuiltinImport:off -- Exercises the synchronous import against a real temp directory.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import { afterEach, assert, describe, it } from "vite-plus/test";

import { importT3CodeHistory } from "./DesktopT3CodeHistoryImport.ts";

const tempHomes: string[] = [];

function makeHome() {
  const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "simplet3-import-"));
  tempHomes.push(home);
  const sourceDir = NodePath.join(home, ".t3", "userdata");
  NodeFS.mkdirSync(NodePath.join(sourceDir, "attachments"), { recursive: true });
  const database = new NodeSqlite.DatabaseSync(NodePath.join(sourceDir, "state.sqlite"));
  database.exec("CREATE TABLE threads (title TEXT); INSERT INTO threads VALUES ('Fix the build');");
  database.close();
  NodeFS.writeFileSync(NodePath.join(sourceDir, "settings.json"), "{}");
  NodeFS.writeFileSync(NodePath.join(sourceDir, "environment-id"), "t3-code-environment");
  NodeFS.writeFileSync(NodePath.join(sourceDir, "attachments", "image.png"), "png");
  return { home, stateDir: NodePath.join(home, ".simplet3", "userdata") };
}

afterEach(() => {
  for (const home of tempHomes.splice(0)) NodeFS.rmSync(home, { recursive: true, force: true });
});

describe("importT3CodeHistory", () => {
  it("copies T3 Code history into an empty SimpleT3Code home", () => {
    const { home, stateDir } = makeHome();

    const result = importT3CodeHistory({ homeDirectory: home, stateDir });

    assert.isTrue(result.imported);
    const imported = new NodeSqlite.DatabaseSync(NodePath.join(stateDir, "state.sqlite"), {
      readOnly: true,
    });
    assert.deepEqual(imported.prepare("SELECT title FROM threads").all(), [
      { title: "Fix the build" },
    ]);
    imported.close();
    assert.isTrue(NodeFS.existsSync(NodePath.join(stateDir, "settings.json")));
    assert.isTrue(NodeFS.existsSync(NodePath.join(stateDir, "attachments", "image.png")));
    assert.isFalse(NodeFS.existsSync(NodePath.join(stateDir, "environment-id")));
  });

  it("never overwrites existing SimpleT3Code history", () => {
    const { home, stateDir } = makeHome();
    NodeFS.mkdirSync(stateDir, { recursive: true });
    NodeFS.writeFileSync(NodePath.join(stateDir, "state.sqlite"), "own history");

    const result = importT3CodeHistory({ homeDirectory: home, stateDir });

    assert.isFalse(result.imported);
    assert.equal(
      NodeFS.readFileSync(NodePath.join(stateDir, "state.sqlite"), "utf8"),
      "own history",
    );
  });
});
