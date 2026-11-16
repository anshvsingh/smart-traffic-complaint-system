#!/usr/bin/env bash
# Connect this repository's DVC data (dataset + trained model) to a Google Drive folder.
#
#   bash scripts/setup-dvc-gdrive.sh <GOOGLE_DRIVE_FOLDER_ID>
#
# The folder ID is the last part of the folder's URL:
#   https://drive.google.com/drive/folders/<GOOGLE_DRIVE_FOLDER_ID>
# It is not secret and is saved in .dvc/config (committed) so the whole team uses the same storage.
#
# Google blocks DVC's built-in sign-in app, so each person also needs an OAuth client
# (see dl/docs/03_dvc_and_mlflow.md). Those credentials are stored in .dvc/config.local,
# which git ignores. Never commit them.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: bash scripts/setup-dvc-gdrive.sh <GOOGLE_DRIVE_FOLDER_ID>" >&2
  exit 1
fi
FOLDER_ID="$1"
cd "$(dirname "$0")/.."

python3 -m pip show dvc-gdrive >/dev/null 2>&1 || python3 -m pip install dvc-gdrive

dvc remote add --default --force gdrive "gdrive://${FOLDER_ID}"
echo "DVC remote 'gdrive' -> gdrive://${FOLDER_ID} (default, saved in .dvc/config)"

if ! dvc config --local remote.gdrive.gdrive_client_id >/dev/null 2>&1; then
  cat <<'EOF'

Next, add your own Google OAuth client (stored only on this computer, in .dvc/config.local):

  dvc remote modify --local gdrive gdrive_client_id     '<CLIENT_ID>.apps.googleusercontent.com'
  dvc remote modify --local gdrive gdrive_client_secret '<CLIENT_SECRET>'

Then upload the data (a browser window opens once to sign in):

  dvc push

Teammates and examiners download it with:

  dvc pull
EOF
fi
