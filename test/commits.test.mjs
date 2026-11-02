// The review's Commits tab (commits.js): the branch's commits since its base,
// tagged by where they are, and one commit's message and files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, scratch, repoWithPrs } from "./git.mjs";
import { branchCommits, commitDetail, commitUrl, parseLog, parseNumstat, plainMarkdown } from "../mods/ship-it-review/commits.js";

// Commits a minute apart, so "newest first" does not depend on timing.
let minute = 0;
function commit(repo, file, text, message) {
  writeFileSync(join(repo, file), text);
  git(repo, "add", file);
  process.env.GIT_AUTHOR_DATE = process.env.GIT_COMMITTER_DATE = `2026-11-01T10:${String(minute++).padStart(2, "0")}:00Z`;
  try { git(repo, "commit", "-q", "-m", message); }
  finally { delete process.env.GIT_AUTHOR_DATE; delete process.env.GIT_COMMITTER_DATE; }
  return git(repo, "rev-parse", "HEAD");
}

// feat/c: one commit pushed, one only here, and one pushed from elsewhere
// (fetched, not pulled).
function branch() {
  const dir = scratch(), repo = repoWithPrs(dir);
  git(repo, "checkout", "-q", "-b", "feat/c", "origin/main");
  const pushed = commit(repo, "a.txt", "one\ntwo\n", "add a\n\nWhy a is needed.");
  git(repo, "push", "-q", "-u", "origin", "feat/c");
  const mine = commit(repo, "b.bin", Buffer.from([0, 1, 2, 0, 255]), "add a binary");
  git(dir, "clone", "-q", "-b", "feat/c", join(dir, "origin"), "other");
  const theirs = commit(join(dir, "other"), "c.txt", "c\n", "add c elsewhere");
  git(join(dir, "other"), "push", "-q", "origin", "feat/c");
  git(repo, "fetch", "-q");
  return { repo, pushed, mine, theirs };
}

test("lists the branch's commits newest first, tagged not pushed and not pulled", async () => {
  const { repo, pushed, mine, theirs } = branch();
  const r = await branchCommits(repo, null, "origin/main");
  assert.equal(r.upstream, "origin/feat/c");
  assert.deepEqual(r.commits.map((c) => [c.sha, c.subject, c.local, c.remote]), [
    [theirs, "add c elsewhere", false, true],
    [mine, "add a binary", true, false],
    [pushed, "add a", true, true],
  ]);
  assert.equal(r.ahead, 1);
  assert.equal(r.behind, 1);
  assert.equal(r.limited, false);
  assert.equal(r.commits[0].author, "Test");
});

test("a branch that tracks its base is not pushed yet: every commit is ahead", async () => {
  const dir = scratch(), repo = repoWithPrs(dir);
  // `checkout -b x origin/main` makes origin/main the upstream: that is the base, not the branch on GitHub.
  git(repo, "checkout", "-q", "-b", "solo", "origin/main");
  assert.equal(git(repo, "rev-parse", "--abbrev-ref", "@{u}"), "origin/main");
  commit(repo, "x.txt", "x\n", "x");
  const r = await branchCommits(repo, null, "origin/main");
  assert.equal(r.upstream, null);
  assert.deepEqual(r.commits.map((c) => [c.subject, c.local, c.remote]), [["x", true, false]]);
  assert.equal(r.ahead, 1);
  // Pushed without -u: origin/solo is found all the same.
  git(repo, "push", "-q", "origin", "solo");
  git(repo, "fetch", "-q");
  const p = await branchCommits(repo, null, "origin/main");
  assert.equal(p.upstream, "origin/solo");
  assert.equal(p.ahead, 0);
  assert.deepEqual(await branchCommits(repo, null, null), { commits: [], upstream: null, ahead: 0, behind: 0, limited: false });
});

test("a commit's detail: full message, author, and files with binary marked", async () => {
  const { repo, pushed, mine, theirs } = branch();
  const a = await commitDetail(repo, null, pushed);
  assert.equal(a.sha, pushed);
  assert.equal(a.message, "add a\n\nWhy a is needed.");
  assert.equal(a.email, "t@example.com");
  assert.deepEqual(a.files, [{ path: "a.txt", add: 2, del: 0, binary: false }]);
  const b = await commitDetail(repo, null, mine.slice(0, 10));
  assert.deepEqual(b.files, [{ path: "b.bin", add: 0, del: 0, binary: true }]);
  // Fetched but not pulled: still in the clone, so it shows.
  assert.equal((await commitDetail(repo, null, theirs)).message, "add c elsewhere");
  await assert.rejects(commitDetail(repo, null, "HEAD; rm -rf"), /Not a commit id/);
  await assert.rejects(commitDetail(repo, null, "0123456789abcdef0123456789abcdef01234567"), /Not in this clone yet/);
});

test("parsers and the GitHub link", () => {
  assert.deepEqual(parseLog(`a\x1fT\x1f2026-01-01T00:00:00Z\x1ffix: x | y\x1e\nb\x1fU\x1f2026-01-02T00:00:00Z\x1f\x1e`).map((c) => [c.sha, c.subject]), [["a", "fix: x | y"], ["b", ""]]);
  assert.deepEqual(parseNumstat("\n1\t2\tsrc/a b.js\0-\t-\timg.png\0"), [
    { path: "src/a b.js", add: 1, del: 2, binary: false },
    { path: "img.png", add: 0, del: 0, binary: true },
  ]);
  assert.equal(commitUrl("https://github.com/o/r/pull/12/files", "abc1234"), "https://github.com/o/r/commit/abc1234");
  assert.equal(commitUrl(null, "abc1234"), null);
  assert.equal(plainMarkdown("# not a heading\n- a_b *c*"), "\\# not a heading  \n\\- a\\_b \\*c\\*");
});
