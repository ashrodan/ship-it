// Scratch repos for the tests: an "origin" and clones of it, under one
// temporary folder that is also HOME (worktrees go to $HOME/.herdr/worktrees).
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WHO = { GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "t@example.com", GIT_CONFIG_NOSYSTEM: "1" };
// Who commits, for every git the tests start (the mods' exec included).
Object.assign(process.env, WHO);

export const git = (cwd, ...args) => execFileSync("git", args, { cwd, env: process.env, encoding: "utf8" }).trim();

export function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "ship-it-test-"));
  process.env.HOME = dir;
  process.env.GIT_CONFIG_GLOBAL = join(dir, ".gitconfig");
  writeFileSync(process.env.GIT_CONFIG_GLOBAL, "[init]\n\tdefaultBranch = main\n[advice]\n\tdetachedHead = false\n");
  return dir;
}

// origin: main (base), feat/x (a PR branch), refs/pull/5/head (a fork's PR).
// Returns the path of a clone of it, named "repo".
export function repoWithPrs(dir) {
  const origin = join(dir, "origin");
  mkdirSync(origin);
  git(origin, "init", "-q", "-b", "main");
  git(origin, "commit", "-q", "--allow-empty", "-m", "base");
  git(origin, "checkout", "-q", "-b", "feat/x");
  git(origin, "commit", "-q", "--allow-empty", "-m", "feat");
  git(origin, "checkout", "-q", "main");
  git(origin, "commit", "-q", "--allow-empty", "-m", "fork work");
  git(origin, "update-ref", "refs/pull/5/head", "HEAD");
  git(origin, "reset", "-q", "--hard", "HEAD~1");
  git(dir, "clone", "-q", origin, "repo");
  return join(dir, "repo");
}
