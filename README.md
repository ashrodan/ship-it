# Ship it

A [Herdr](https://herdr.dev) mod that takes the branch you're working on to a
merged pull request without leaving your terminals.

![Ship it](preview.png)

https://github.com/user-attachments/assets/5e31d154-aa5b-4854-af67-2ddc534e9a19

The 40-second showcase: Claude and Codex at work on a real pull request, the
strip, PR changes, the review, the PR list and Ship.

- **The strip**, under the tab bar, always says where the work is: machine,
  folder, branch (ahead/behind, uncommitted), and the pull request with its
  state, conflicts, checks, open review threads and review decision. It
  follows the pane you're in, across spaces and machines.
- **PR changes** opens the side panel on everything the branch changes since
  its base, uncommitted work included. Double-click a file to read it whole
  in a pane.
- **PRs** lists the repo's open pull requests, 10 at a time, newest update
  first (All, Mine, To review), with a Load more button.
- **Ship** merges the pull request, after a confirm that says how, into what,
  and what still looks wrong (failing checks, no approval, open threads).
- **The review** (click the PR on the strip) opens in the side panel, like
  PR changes, and has three tabs:
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

- The Herdr desktop app (`herdr-app`), macOS or Linux, and `python3` for
  `--layout`.
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

Without the panel blocks, the PR changes and PRs buttons hide, and the
review opens as a pane to the right instead.

## Keys (review pane)

`1` `2` `3` tabs · `r` refresh · `o` open on GitHub · `j`/`k` next/previous
file · `v` viewed · `n` next unviewed · `e` open the file · `⌘↵` post ·
`esc` close a drawer or log. Bindable as commands too
(`ship-it-review.files`, `ship-it-review.next-unviewed`, …). The PRs panel
has `ship-it-prs.more`, `.refresh`, `.all`, `.mine` and `.review`.

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

## Layout of this repo

- `mods/ship-it/`: the strip, and `data.js` (git and GitHub facts, shared).
- `mods/ship-it-review/`: the review (a panel, or a pane), and `files.js` (the branch diff).
- `mods/ship-it-changes/`, `mods/ship-it-prs/`: the two panels.
- `mods/ship-it-file/`: the read-only file pane.
- `scripts/install.sh`: copies the shared `data.js`, `files.js` and icons
  into the mods that use them (a mod can't import from another), installs
  and checks the mods, and with `--layout` runs `scripts/add-to-layout.py`.
  `--sync` only refreshes the copies.
- `scripts/perf/`: the window-stall check (`run.sh`).
- `docs/performance.md`: the stall investigation and its next steps.
- `RECIPE.md`: the full spec, detailed enough for an agent to rebuild it.

## Credits

Icons from [Lucide](https://lucide.dev) (ISC License).

## License

MIT. See `LICENSE`.
