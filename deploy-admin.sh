#!/usr/bin/env sh
set -eu

if [ "${1:-}" = "" ]; then
  echo "Usage: sh ./deploy-admin.sh <firebase-project-id>"
  exit 1
fi

PROJECT_ID="$1"
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

cd "$ROOT_DIR"
npm run build

firebase deploy --project "$PROJECT_ID" --only hosting:admin

echo "Admin deploy complete for project: $PROJECT_ID"
