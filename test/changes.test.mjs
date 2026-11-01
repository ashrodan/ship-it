// The Changes panel's two views (files.js): Uncommitted is branchFiles
// against HEAD, Since main against the base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { git, scratch, repoWithPrs } from "./git.mjs";
import { branchFiles, fileDiff, diffRows } from "../mods/ship-it-review/files.js";

// A branch with one commit, then an edit and a new file not yet committed.
function work() {
  const dir = scratch(), repo = repoWithPrs(dir);
  writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
  git(repo, "add", "a.txt"); git(repo, "commit", "-q", "-m", "a on main");
  git(repo, "checkout", "-q", "-b", "feat");
  writeFileSync(join(repo, "b.txt"), "b\n");
  git(repo, "add", "b.txt"); git(repo, "commit", "-q", "-m", "b on feat");
  appendFileSync(join(repo, "a.txt"), "three\n");
  writeFileSync(join(repo, "new.txt"), "x\ny\n");
  return repo;
}
const brief = (files) => files.map((f) => [f.path, f.status, f.add, f.del, f.dirty]);

test("Uncommitted: the working tree against HEAD, new files included", async () => {
  const repo = work();
  const { mb, files } = await branchFiles(repo, null, "HEAD");
  assert.equal(mb, git(repo, "rev-parse", "HEAD"));
  assert.deepEqual(brief(files), [["a.txt", "M", 1, 0, true], ["new.txt", "A", 2, 0, true]]);
});

test("Since main: the branch's commits and the uncommitted work", async () => {
  const repo = work();
  const { files } = await branchFiles(repo, null, "main");
  assert.deepEqual(brief(files), [["a.txt", "M", 1, 0, true], ["b.txt", "A", 1, 0, false], ["new.txt", "A", 2, 0, true]]);
});

test("Uncommitted with nothing to commit is empty", async () => {
  const repo = repoWithPrs(scratch());
  const { files } = await branchFiles(repo, null, "HEAD");
  assert.deepEqual(files, []);
});

test("a diff: a new file whole, an edit as a hunk, numbered on both sides", async () => {
  const repo = work();
  const { mb, files } = await branchFiles(repo, null, "HEAD");
  const fresh = await fileDiff(repo, null, mb, files.find((f) => f.path === "new.txt"));
  assert.deepEqual(fresh.lines, ["@@ -0,0 +1,2 @@", "+x", "+y"]);
  const edit = await fileDiff(repo, null, mb, files.find((f) => f.path === "a.txt"));
  const rows = diffRows(edit.lines);
  assert.equal(rows[0].kind, "@");
  assert.deepEqual(rows.slice(1).map((r) => [r.kind, r.old, r.new, r.text]), [[" ", 1, 1, "one"], [" ", 2, 2, "two"], ["+", undefined, 3, "three"]]);
});
