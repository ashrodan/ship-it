// The branch's commits since its base, for the review's Commits tab: what is
// local, what is on GitHub (the upstream), and one commit's message and files.
// Git only: it works offline, on another machine (`on`), and without gh.

import { exec } from "herdr";
import { READ } from "./data.js";

export const MAX_COMMITS = 250;

const git = (args, root, on) => exec("git", [...READ, ...args], { cwd: root, on });
const SHA = /^[0-9a-f]{7,40}$/i;
// Unit and record separators: subjects and messages may hold anything else.
const US = "\x1f", RS = "\x1e";
const FORMAT = `--format=%H${US}%an${US}%aI${US}%s${RS}`;

export function parseLog(text) {
  return (text || "").split(RS).map((r) => r.replace(/^\n/, "")).filter(Boolean).map((r) => {
    const [sha, author, date, subject] = r.split(US);
    return { sha, author, date, subject: subject ?? "" };
  });
}

// `git show --numstat -z --format=`: "add\tdel\tpath\0" per file
// ("-\t-\tpath" for a binary file).
export function parseNumstat(text) {
  return (text || "").split("\0").map((e) => e.replace(/^\n+/, "")).filter((e) => /^(\d+|-)\t(\d+|-)\t./.test(e)).map((e) => {
    const [a, d, ...rest] = e.split("\t");
    return { path: rest.join("\t"), add: a === "-" ? 0 : Number(a), del: d === "-" ? 0 : Number(d), binary: a === "-" };
  });
}

// Where the branch is on GitHub: its upstream, unless that is the base (a
// branch made with `checkout -b x origin/main` tracks main), else
// origin/<branch> (pushed without -u). Null: not pushed yet.
async function upstreamOf(root, on, base) {
  const [up, head] = await Promise.all([
    git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], root, on),
    git(["symbolic-ref", "--short", "-q", "HEAD"], root, on),
  ]);
  const u = up.code === 0 ? up.stdout.trim() : null;
  if (u && u !== base) return u;
  const branch = head.code === 0 ? head.stdout.trim() : null;
  if (!branch || `origin/${branch}` === base) return null;
  const pushed = await git(["rev-parse", "-q", "--verify", `refs/remotes/origin/${branch}`], root, on);
  return pushed.code === 0 ? `origin/${branch}` : null;
}

// { commits: [{ sha, author, date, subject, local, remote }], upstream, ahead, behind, limited }
// Newest first. `local`: reachable from HEAD; `remote`: from the upstream.
// ahead = local only (not pushed), behind = remote only (not pulled).
// With no upstream, every commit is local and ahead.
export async function branchCommits(root, on, base) {
  if (!base) return { commits: [], upstream: null, ahead: 0, behind: 0, limited: false };
  const upstream = await upstreamOf(root, on, base);
  const [mine, theirs] = await Promise.all([
    git(["log", FORMAT, "-n", String(MAX_COMMITS + 1), `${base}..HEAD`], root, on),
    upstream ? git(["log", FORMAT, "-n", String(MAX_COMMITS + 1), `${base}..${upstream}`], root, on) : null,
  ]);
  if (mine.code !== 0) throw new Error(mine.stderr.trim() || "git log failed");
  const local = parseLog(mine.stdout), remote = theirs?.code === 0 ? parseLog(theirs.stdout) : [];
  const onRemote = new Set(remote.map((c) => c.sha)), onLocal = new Set(local.map((c) => c.sha));
  const all = [
    ...local.map((c) => ({ ...c, local: true, remote: onRemote.has(c.sha) })),
    ...remote.filter((c) => !onLocal.has(c.sha)).map((c) => ({ ...c, local: false, remote: true })),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const limited = local.length > MAX_COMMITS || remote.length > MAX_COMMITS;
  return {
    commits: all.slice(0, MAX_COMMITS),
    upstream,
    ahead: local.filter((c) => !onRemote.has(c.sha)).length,
    behind: remote.filter((c) => !onLocal.has(c.sha)).length,
    limited,
  };
}

// { sha, author, email, date, message, files: [{ path, add, del, binary }] }
export async function commitDetail(root, on, sha) {
  if (!SHA.test(sha || "")) throw new Error("Not a commit id");
  const [meta, stat] = await Promise.all([
    git(["show", "-s", `--format=%H${US}%an${US}%ae${US}%aI${US}%B`, sha], root, on),
    git(["show", "--numstat", "-z", "--no-renames", "--format=", sha], root, on),
  ]);
  if (meta.code !== 0) throw new Error(/unknown revision|bad object|ambiguous/i.test(meta.stderr) ? "Not in this clone yet (fetch to see it)" : meta.stderr.trim() || "git show failed");
  const [full, author, email, date, ...body] = meta.stdout.split(US);
  return { sha: full, author, email, date, message: body.join(US).trim(), files: parseNumstat(stat.stdout) };
}

// Plain text as markdown that shows it as written: punctuation escaped (a
// "# x" or "- x" line stays literal) and every newline a hard break.
export function plainMarkdown(text) {
  return (text || "").replace(/[\\`*_{}[\]()#+\-.!<>|~]/g, "\\$&").split("\n").join("  \n");
}

// The commit's page on GitHub, from the PR's URL.
export function commitUrl(prUrl, sha) {
  const m = /^(https:\/\/github\.com\/[^/]+\/[^/]+)\/pull\/\d+/.exec(prUrl || "");
  return m && sha ? `${m[1]}/commit/${sha}` : null;
}
