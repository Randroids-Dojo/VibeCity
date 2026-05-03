#!/usr/bin/env bash
#
# REQ-051: AGENTS.md Rule 1 enforcement.
#
# Scans every committed source file for U+2014 (em-dash) and U+2013 (en-dash).
# Prints any offending lines and exits non-zero on hits, exit 0 otherwise.
#
# Plain hyphen-minus (U+002D) is allowed, so this scan only flags the two
# Unicode codepoints AGENTS.md bans. Implemented with `git ls-files` piped
# through perl so it runs portably on macOS (BSD grep lacks PCRE, default
# bash 3.2 lacks mapfile) and on Linux CI runners.
#
# Run from anywhere via `npm run check:dashes` or `bash scripts/check-no-dashes.sh`.
set -euo pipefail

if REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" && [[ -n "$REPO_ROOT" ]]; then
  cd "$REPO_ROOT"
else
  REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$REPO_ROOT"
fi

HITS_FILE="$(mktemp)"
trap 'rm -f "$HITS_FILE"' EXIT

# Tracked file extensions that must be dash-clean. Listed as `git ls-files`
# pathspecs. Limiting to tracked files keeps node_modules, .next, and other
# untracked output out of scope without per-directory exclude lists.
git ls-files -z -- \
  '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' \
  '*.md' '*.mdx' '*.json' '*.yml' '*.yaml' \
  '*.css' '*.scss' '*.html' '*.sh' '*.toml' \
  | perl -0 -ne '
      # Each NUL-separated record is a path. Open it, scan for the banned
      # codepoints, print "path:line:body" on hits.
      use open ":std", ":utf8";
      chomp;
      my $path = $_;
      next unless length $path;
      open(my $fh, "<:utf8", $path) or next;
      while (my $line = <$fh>) {
        if ($line =~ /[\x{2014}\x{2013}]/) {
          print "$path:$.:$line";
        }
      }
      close $fh;
    ' > "$HITS_FILE" || true

if [[ -s "$HITS_FILE" ]]; then
  cat "$HITS_FILE" >&2
  echo "" >&2
  echo "ERROR: em-dash (U+2014) or en-dash (U+2013) found in committed source." >&2
  echo "AGENTS.md Rule 1 forbids both. Replace with a period, comma, colon, parens, or rewrite the sentence." >&2
  echo "Plain hyphens (U+002D) are fine for ranges and compound words." >&2
  exit 1
fi

echo "ok: no em-dash or en-dash found in tracked source."
