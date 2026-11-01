#!/usr/bin/env bash
# Installs Ship it into the Herdr app: copies the shared data layer and icons
# from mods/ship-it into mods/ship-it-review, and data.js and files.js into
# mods/ship-it-changes, data.js into mods/ship-it-prs (a mod can't import
# from another mod's folder), then copies the mod folders into the app's
# mods folder.
#
#   scripts/install.sh                  # install the mods
#   scripts/install.sh --layout NAME    # and add the blocks to layouts/NAME.json
#   scripts/install.sh --sync           # only refresh the copies (for development)
#
# Into ${HERDR_APP_HOME:-~/.config/herdr-app}. Run it again after a git pull to update.
#
# Ship it runs git, gh and the system URL opener with your own permissions.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
src="$repo/mods/ship-it"
review="$repo/mods/ship-it-review"
changes="$repo/mods/ship-it-changes"
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
dest="$home/mods"
layout=""
case "${1:-}" in
  --layout)
    layout="${2:?--layout needs a layout name: herdr-app status shows the one on screen}"
    case "$layout" in
      main|terminals|win98)
        echo "'$layout' is one of Herdr's own layouts: they are read-only and replaced on every start." >&2
        echo "Clone it first, then install into the clone:" >&2
        echo "  cp \"$home/layouts/$layout.json\" \"$home/layouts/my-$layout.json\"" >&2
        echo "  scripts/install.sh --layout my-$layout" >&2
        exit 1 ;;
    esac
    [[ -f "$home/layouts/$layout.json" ]] || { echo "no layout at $home/layouts/$layout.json" >&2; exit 1; } ;;
esac

cp "$src/data.js" "$review/data.js"
rm -rf "$review/icons"
cp -R "$src/icons" "$review/icons"
cp "$src/data.js" "$changes/data.js"
cp "$review/files.js" "$changes/files.js"
cp "$src/data.js" "$repo/mods/ship-it-prs/data.js"
echo "synced data.js and icons/ into mods/ship-it-review, data.js and files.js into mods/ship-it-changes, data.js into mods/ship-it-prs"

[[ "${1:-}" == "--sync" ]] && exit 0

"$repo/scripts/test.sh" </dev/null >/dev/null || { echo "tests failed: run scripts/test.sh to see which" >&2; exit 1; }
echo "tests passed"

if [[ ! -d "$dest" ]]; then
  echo "no Herdr mods folder at $dest (set HERDR_APP_HOME)" >&2
  exit 1
fi

for mod in ship-it ship-it-review ship-it-changes ship-it-file ship-it-prs; do
  mkdir -p "$dest/$mod"
  # Copy the mod's own files; leave the app-written type files alone.
  rsync -a --delete \
    --exclude 'gpui-kit.d.ts' --exclude 'herdr.d.ts' --exclude 'jsconfig.json' --exclude '.DS_Store' \
    "$repo/mods/$mod/" "$dest/$mod/"
  echo "installed $mod -> $dest/$mod"
done

if command -v herdr-app >/dev/null; then
  for mod in ship-it ship-it-review ship-it-changes ship-it-file ship-it-prs; do herdr-app check "$dest/$mod"; done
fi

if [[ -n "$layout" ]]; then
  echo "layout $layout:"
  python3 "$repo/scripts/add-to-layout.py" "$home/layouts/$layout.json"
  echo "switch to it with: herdr-app do layout.switch --name $layout"
fi
