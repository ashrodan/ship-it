# Ship it

A [Herdr](https://herdr.dev) mod that takes the branch you're working on to a
merged pull request without leaving your terminals.

![Ship it](preview.png)

https://github.com/user-attachments/assets/5e31d154-aa5b-4854-af67-2ddc534e9a19

The 40-second showcase: Claude and Codex at work on a real pull request, the
strip, PR changes, the review, the PR list and Ship.

- **The strip**, under the tab bar, always says where the work is: first
  the repo's name with its open PR count (a click opens the PRs list), the
  folder when it says more (a worktree, a subfolder), and what the pull
  request waits on: conflicts, checks, open review
  threads and the review decision. (The machine and branch are in Herdr's
  status bar.) It follows the pane you're in, across spaces and machines.
- **CI**, on the right between the changes and PRs buttons: the PR's checks
  as passed, failed and running counts. It opens the review on Checks.
- **The PR button**, first on the right, is the main action: the PR's
  number, state and the first 30 characters of its title. It opens the
  review. On a branch with no PR it is **Create PR**.
- **Changes** is one side panel with two views. **Uncommitted** is the
  working tree against `HEAD`, with a commit box (`git add -A`, then
  `git commit -m`, as Herdr's own Changes panel does). **Since main** is
  everything the branch changes since its base, uncommitted work included.
  It takes the place of Herdr's Changes panel, so the tab bar's Changes
  button opens it. The strip's changes button (its file count and `+/−`)
  opens it on Since main. Double-click a file to read it whole
  in a pane.
- **PRs** (the repo's name on the strip) lists the repo's open pull requests, 10 at a time, newest update
  first (All, Mine, To review), with a Load more button. Click a PR to open
  its details: branch, checks, review and who is asked, labels, its
  worktree, and buttons for its worktree, GitHub, and copying the link. The
  worktree button says what a click does: **Go to space** (a space is open on
  its checkout), **Open worktree** (checked out, no space yet) or **Create
  worktree** (checks the PR out first). The icon at a row's end does the same
  in one click: an accent branch, an accent folder, or a dim branch-plus.
- **Ship** merges the pull request, after a confirm that says how, into what,
  and what still looks wrong (failing checks, no approval, open threads).
- **The review** (the PR button on the strip) opens in the side panel, like
  Changes, and has three tabs:
  **Overview** (description, conversation, conflicts with a copyable list,
  open threads, a comment box), **Files** (the diff, "viewed" marks, inline
  threads with Reply and Resolve) and **Checks** (failing first, the failed
  log's tail, Re-run failed).

## Install

### Ask your agent

In a Herdr terminal, paste this to your coding agent:

```text
Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/ashrodan/ship-it
```

It follows the "Layouts and mods other people made" steps there, and
`RECIPE.md` says which four blocks go into your layout.

### Or install it yourself

```sh
git clone https://github.com/ashrodan/ship-it && cd ship-it
scripts/install.sh --layout my-main   # your layout: herdr-app status shows its name
herdr-app do layout.switch --name my-main
```

`--layout` adds the strip under the tab bar and the three panels next to
Files and Changes, once, after backing the file up to `<name>.json.before-ship-it`.
Herdr's own layouts (`main`, `terminals`, `win98`) are read-only, so clone
one first:

```sh
cp ~/.config/herdr-app/layouts/main.json ~/.config/herdr-app/layouts/my-main.json
```

Without `--layout`, the script only installs the mods; add the blocks by hand
(below).

**Update:** `git pull && scripts/install.sh`. **Remove:** delete
`~/.config/herdr-app/mods/ship-it*` and restore the layout from its
`.before-ship-it` backup.

### Requirements

- The Herdr desktop app (`herdr-app`), macOS, Linux or Windows (with Git
  for Windows, whose `grep` counts untracked files' lines), and `python3`
  for `--layout`.
- `git`, and the [GitHub CLI](https://cli.github.com) logged in
  (`gh auth login`) for anything about pull requests. Without `gh` the strip
  still shows the folder, branch and changes.
- Remote machines work through Herdr's own `exec`: they need `git` and `gh`
  there too.

### The blocks, by hand

1. The strip, in the work column right after the tab bar (`tabs`):

   ```json
   { "id": "ship-it", "type": "block", "size": { "px": 40 }, "content": { "mod": "ship-it" } }
   ```

2. Three panels, as children of the `panel-body` stack after `changes`:

   ```json
   { "id": "ship-it-changes", "type": "block", "content": { "mod": "ship-it-changes" } },
   { "id": "ship-it-review", "type": "block", "content": { "mod": "ship-it-review" } },
   { "id": "ship-it-prs", "type": "block", "content": { "mod": "ship-it-prs" } }
   ```

Without the panel blocks, the changes and PRs buttons hide, and the
review opens as a pane to the right instead.

## Keys (review pane)

`1` `2` `3` tabs · `r` refresh · `o` open on GitHub · `j`/`k` next/previous
file · `v` viewed · `n` next unviewed · `e` open the file · `⌘↵` post ·
`esc` close a drawer or log. Bindable as commands too
(`ship-it-review.files`, `ship-it-review.next-unviewed`, …). The PRs panel
has `ship-it-prs.more`, `.refresh`, `.all`, `.mine`, `.review` and
`.worktree-<number>` (open that PR in a worktree space) and `.details-<number>`.

## What it does on your behalf

Ship it runs `git` and `gh` as you, in the repo you're in. Reading is
side-effect free: git reads skip index refreshes and locks. These write, and
only on a click:

| Action | Runs |
| --- | --- |
| Comment | `gh pr comment` |
| Reply, Resolve, Reopen | GitHub GraphQL review-thread mutations |
| Re-run failed | `gh run rerun --failed` |
| Ship | `gh pr merge --squash` (or `--merge`/`--rebase`, whichever the repo allows) `--match-head-commit <sha>`, after a confirm. A push after the confirm opened makes GitHub refuse. The branch is kept. |
| Create | `gh pr create --web` |
| Worktree (a PR's branch button) | `git fetch origin <branch>`, then `git worktree add --track -b <branch> ~/.herdr/worktrees/<repo>/<branch> origin/<branch>` (a local branch of that name is checked out as it is). A fork's PR: `git fetch origin pull/<n>/head` on a new `pr-<n>`. Then a space opens on it, nested under the repo's. When the checkout exists, its space is shown instead. |

Conflict detection runs `git merge-tree` in memory, only when GitHub reports
a conflict; it writes loose objects to `.git` and nothing else.

## Performance

Herdr redraws the whole window for every mod redraw, so Ship it stays quiet:
it redraws only when what it shows changes, panels and panes that aren't on
screen do no work until they are, a burst of file changes becomes one
refresh, and the review pane reads the diff only when its Files tab shows.
Each part keeps the last facts for recent repos and branches, so going back
to a worktree shows them at once while a refresh runs. The strip asks GitHub
once and shares the pull request with the review, so the review asks again
only when you refresh or post.

If the whole Herdr window stalls, see `docs/performance.md`: the cause found
so far is in Herdr's JavaScript JIT, with measurements and next steps.

## Tests

`scripts/test.sh` runs them (Node 22+, git, python3); `scripts/install.sh`
runs them first, and CI runs them on every pull request. They check the
mods' logic under plain Node, with a stand-in for Herdr's `herdr` module
(`test/herdr.mjs`):

- **PRs panel** (`mods/ship-it-prs/prs.js`): check states and counts; a
  PR's worktree created in real scratch repos (a same-repo PR tracks
  `origin`, a fork's comes from `pull/<n>/head`, a local branch is never
  reset); spaces matched to checkouts (the deepest wins); the worktree
  button's three states.
- **Changes**: Uncommitted and Since main file lists, and diffs.
- **Layout script**: a fresh layout, an older install, a second run.
- **The repo**: the copies `install.sh` makes match their originals, every
  mod file parses, and no class defines a method twice.

What they can't check is drawing: that needs the Herdr window
(`herdr-app check`, then look).

## Layout of this repo

- `mods/ship-it/`: the strip, and `data.js` (git and GitHub facts, shared).
- `mods/ship-it-review/`: the review (a panel, or a pane), and `files.js` (the branch diff).
- `mods/ship-it-changes/`, `mods/ship-it-prs/`: the two panels.
- `mods/ship-it-file/`: the read-only file pane.
- `scripts/install.sh`: copies the shared `data.js`, `files.js` and icons
  into the mods that use them (a mod can't import from another), installs
  and checks the mods, and with `--layout` runs `scripts/add-to-layout.py`.
  `--sync` only refreshes the copies.
- `scripts/test.sh` and `test/`: the tests; `.github/workflows/ci.yml` runs them.
- `scripts/perf/`: the window-stall check (`run.sh`).
- `scripts/showcase/`: builds the showcase video from window captures.
- `docs/performance.md`: the stall investigation and its next steps.
- `RECIPE.md`: the full spec, detailed enough for an agent to rebuild it.

## Credits

Icons from [Lucide](https://lucide.dev) (ISC License).

## License

MIT. See `LICENSE`.
