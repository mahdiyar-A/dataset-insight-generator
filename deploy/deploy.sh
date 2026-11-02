#!/usr/bin/env bash
# Deploy DIG's backend + AI service to the Lightsail server.
#
#   bash deploy/deploy.sh          (Git Bash, from the repo root)
#
# Ships exactly what is committed — `git archive HEAD` — so the server can never
# run code that isn't on GitHub, and a virtualenv or bin/ folder on this
# machine can never end up in an image. Secrets are the one exception: the two
# .env files are never committed, so they are streamed from this machine
# straight to the server over SSH.

set -euo pipefail

HOST="${DIG_HOST:-ubuntu@3.96.77.210}"
KEY="${DIG_KEY:-$HOME/.ssh/dig-key.pem}"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=15)
APP=/opt/dig/app

cd "$(git rev-parse --show-toplevel)"

if ! git diff --quiet HEAD -- backend ai_service deploy; then
  echo "Uncommitted changes in backend/, ai_service/ or deploy/."
  echo "Commit them first — the server only ever runs committed code."
  exit 1
fi
for f in backend/.env ai_service/.env; do
  [ -f "$f" ] || { echo "Missing $f — the server needs it for its secrets."; exit 1; }
done

REV=$(git rev-parse --short HEAD)
echo "==> Deploying $REV to $HOST"

echo "==> Uploading code"
# core.autocrlf=false: with it on (the Windows default here), git archive
# writes CRLF line endings, which Linux shells and Dockerfiles choke on.
git -c core.autocrlf=false archive --format=tar HEAD backend ai_service deploy | gzip |
  "${SSH[@]}" "$HOST" "set -e; mkdir -p $APP; cd $APP; rm -rf backend ai_service deploy; tar -xz"

echo "==> Uploading secrets"
# CR stripped on the way: a Windows-edited .env would otherwise give every
# secret an invisible trailing carriage return, and keys fail silently.
tr -d '\r' < backend/.env    | "${SSH[@]}" "$HOST" "umask 077; cat > $APP/backend/.env"
tr -d '\r' < ai_service/.env | "${SSH[@]}" "$HOST" "umask 077; cat > $APP/ai_service/.env"

echo "==> Building and starting (first build takes several minutes)"
"${SSH[@]}" "$HOST" "set -e; cd $APP; echo $REV > REVISION
  docker compose -f deploy/docker-compose.prod.yml up -d --build --remove-orphans
  # Caddy reads its config through a bind mount; restart so a changed Caddyfile
  # takes effect. Certificates live in a volume and survive this.
  docker compose -f deploy/docker-compose.prod.yml restart caddy
  docker image prune -f >/dev/null
  docker compose -f deploy/docker-compose.prod.yml ps"

echo "==> Done. Live check:  curl https://api.datainsightgen.com/health"
