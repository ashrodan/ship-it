// The PRs panel: what checks say, and a PR's worktree (mods/ship-it-prs/prs.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { state } from "./herdr.mjs";
import { git, scratch, repoWithPrs } from "./git.mjs";
import { checkState, checkCounts, localBranch, slug, worktrees, addWorktree, places, spaceAt, showSpace, treeLook } from "../mods/ship-it-prs/prs.js";

const done = (conclusion) => ({ status: "COMPLETED", conclusion });

test("checks: one word, and counts", () => {
  assert.equal(checkState([]), null);
  assert.equal(checkState([done("SUCCESS"), done("SKIPPED")]), "pass");
  assert.equal(checkState([done("SUCCESS"), { status: "IN_PROGRESS" }]), "pending");
  assert.equal(checkState([{ status: "IN_PROGRESS" }, done("FAILURE")]), "fail");
  assert.equal(checkState([{ state: "PENDING" }]), "pending");
  assert.deepEqual(checkCounts([done("SUCCESS"), done("FAILURE"), { status: "QUEUED" }, { state: "SUCCESS" }]), { pass: 2, fail: 1, pending: 1 });
});

test("a PR's local branch and folder name", () => {
  assert.equal(localBranch({ number: 7, headRefName: "feat/x", isCrossRepository: false }), "feat/x");
  assert.equal(localBranch({ number: 7, headRefName: "main", isCrossRepository: true }), "pr-7");
  assert.equal(slug("ashrodan/DAS-607 fix!"), "ashrodan-DAS-607-fix");
});

test("worktree list: branch to path", async () => {
  const dir = scratch(), repo = repoWithPrs(dir);
  git(repo, "worktree", "add", "-q", "-b", "side", join(dir, "side"));
  git(repo, "worktree", "add", "-q", "--detach", join(dir, "loose"));
  const trees = await worktrees(repo, null);
  assert.deepEqual(Object.keys(trees).sort(), ["main", "side"]); // a detached checkout has no branch
  assert.equal(realpathSync(trees.side), realpathSync(join(dir, "side")));
});

test("create: a same-repo PR tracks origin's branch", async () => {
  const dir = scratch(), repo = repoWithPrs(dir);
  const path = await addWorktree(repo, null, { number: 3, headRefName: "feat/x", isCrossRepository: false });
  assert.equal(path, join(dir, ".herdr/worktrees/repo/feat-x"));
  assert.equal(git(path, "branch", "--show-current"), "feat/x");
  assert.equal(git(path, "rev-parse", "--abbrev-ref", "@{upstream}"), "origin/feat/x");
  assert.equal(git(path, "log", "-1", "--format=%s"), "feat");
});

test("create: a fork's PR comes from pull/<n>/head onto pr-<n>", async () => {
  const dir = scratch(), repo = repoWithPrs(dir);
  const path = await addWorktree(repo, null, { number: 5, headRefName: "main", isCrossRepository: true });
  assert.equal(path, join(dir, ".herdr/worktrees/repo/pr-5"));
  assert.equal(git(path, "branch", "--show-current"), "pr-5");
  assert.equal(git(path, "log", "-1", "--format=%s"), "fork work");
});

test("create: a local branch of that name is used as it is, never reset", async () => {
  const dir = scratch(), repo = repoWithPrs(dir);
  git(repo, "branch", "feat/x", "main"); // local, behind origin/feat/x
  const mine = git(repo, "rev-parse", "feat/x");
  const path = await addWorktree(repo, null, { number: 3, headRefName: "feat/x", isCrossRepository: false });
  assert.equal(git(path, "rev-parse", "HEAD"), mine);
});

test("create: named after the main checkout, also from inside a worktree", async () => {
  const dir = scratch(), repo = repoWithPrs(dir);
  git(repo, "worktree", "add", "-q", "-b", "other", join(dir, "elsewhere"));
  const path = await addWorktree(join(dir, "elsewhere"), null, { number: 3, headRefName: "feat/x", isCrossRepository: false });
  assert.equal(path, join(dir, ".herdr/worktrees/repo/feat-x"));
});

test("create: git's own error comes back", async () => {
  const dir = scratch(), repo = repoWithPrs(dir);
  await assert.rejects(addWorktree(repo, null, { number: 9, headRefName: "gone", isCrossRepository: false }), /gone|couldn't find|not our ref/i);
});

test("spaces: matched by their first terminal's folder, else where they were made", () => {
  state.spaces = [
    { id: "a", machine: null, folder: "/x", tabs: [{ id: "ta" }] },
    { id: "b", machine: null, folder: "/r/w", tabs: [{ id: "tb" }] },
    { id: "c", machine: "box", folder: "/r", tabs: [] },
  ];
  state.panes = [{ tab: "ta", cwd: "/r/sub" }, { tab: "tb", cwd: null }];
  assert.deepEqual(places(null).map((p) => [p.s.id, p.at]), [["a", "/r/sub"], ["b", "/r/w"]]);
  assert.deepEqual(places("box").map((p) => p.s.id), ["c"]);
});

test("spaces: the deepest checkout wins", () => {
  const where = [{ s: "main", at: "/r/sub" }, { s: "nested", at: "/r/.worktrees/x/a" }];
  const paths = ["/r", "/r/.worktrees/x", "/h/.herdr/worktrees/r/y"];
  assert.equal(spaceAt("/r", where, paths), "main");
  assert.equal(spaceAt("/r/.worktrees/x", where, paths), "nested");
  assert.equal(spaceAt("/h/.herdr/worktrees/r/y", where, paths), undefined);
  assert.equal(spaceAt(undefined, where, paths), undefined);
  assert.equal(spaceAt("/r/.worktrees", [{ s: "nested", at: "/r/.worktrees/x" }], paths), undefined);
});

test("the worktree button: go to the space, open the checkout, or create it", () => {
  scratch();
  const path = join(process.env.HOME, ".herdr/worktrees/r/y");
  assert.equal(treeLook(path, { id: "s" }).label, "Go to space");
  assert.equal(treeLook(path, undefined).label, "Open worktree");
  assert.match(treeLook(path, undefined).tip, /~\/\.herdr\/worktrees\/r\/y/);
  assert.equal(treeLook(undefined, undefined).label, "Create worktree");
});

test("showing a checkout selects its space, else makes one", () => {
  state.spaces = [{ id: "s1", machine: null, folder: "/w/y", tabs: [] }];
  state.panes = []; state.runs = [];
  showSpace("/w/y", null, ["/w/y"]);
  showSpace("/w/z", null, ["/w/y", "/w/z"]);
  assert.deepEqual(state.runs, [["space.select", { id: "s1" }], ["space.new", { folder: "/w/z" }]]);
});
