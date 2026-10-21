#!/bin/sh
# Copies data/landsat/ (made by build_landsat.py, not in the repository) to the R2 bucket that the Worker serves at /data/landsat/*.
# One-time setup: Cloudflare dashboard -> R2 -> Manage API tokens -> create a token with Object Read & Write for the bucket, then
#   rclone config   (type s3, provider Cloudflare, the access key, secret and endpoint https://<account id>.r2.cloudflarestorage.com; call the remote "r2")
# Usage:  scripts/upload_landsat.sh <bucket name>      (the same name as the repository variable CF_R2_LANDSAT_BUCKET)
set -e
[ -n "$1" ] || { echo "usage: $0 <bucket name>"; exit 1; }
cd "$(dirname "$0")/.."
rclone sync data/landsat "r2:$1/data/landsat" --include "*.jpg" --include "*.json" --transfers 16 --progress
