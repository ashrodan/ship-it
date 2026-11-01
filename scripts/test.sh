#!/bin/sh
# Runs the tests: the mods' logic under plain Node, with a stand-in for
# Herdr's "herdr" module (test/herdr.mjs), real git in scratch repos, and the
# layout script. Needs node 22 or later, git and python3.
set -e
cd "$(dirname "$0")/.."
exec node --import ./test/register.mjs --test test/*.test.mjs
