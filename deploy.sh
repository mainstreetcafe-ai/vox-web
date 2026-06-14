#!/bin/bash
# vox-web deploy: build, then publish dist/ to the gh-pages branch (custom domain
# vox.mainstreetcafe.ai via the committed CNAME). The repo had no deploy script;
# this captures the worktree method prior deploys used.
#
# NOTE: the build bakes VITE_* from .env into the public bundle (incl.
# VITE_VOX_CLASSIFY_TOKEN and the Supabase anon key). Treat anything in the bundle
# as public. Running this publishes that bundle to gh-pages.
set -euo pipefail
cd "$(dirname "$0")"

echo "Building..."
npm run build

MAIN=$(git rev-parse --short HEAD)
WT=/tmp/vox-ghpages-deploy
git worktree remove --force "$WT" 2>/dev/null || true
rm -rf "$WT"
git fetch -q origin gh-pages
git worktree add -f "$WT" gh-pages >/dev/null
git -C "$WT" reset --hard -q origin/gh-pages

rsync -a --delete --exclude '.git' dist/ "$WT/"

git -C "$WT" add -A
if git -C "$WT" diff --cached --quiet; then
  echo "No changes to deploy."
else
  git -C "$WT" commit -q -m "Deploy vox-web ($MAIN)"
  git -C "$WT" push -q origin gh-pages
  echo "Deployed gh-pages from main $MAIN -> https://vox.mainstreetcafe.ai"
fi
git worktree remove --force "$WT"
