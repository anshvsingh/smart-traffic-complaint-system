# DVC and MLflow in TrafficCare

## 1. DVC: versioning the dataset and the trained model

| Tracked file | Size | Purpose |
|---|---|---|
| `dl/datasets/raw.dvc` | 71 MB, 5,998 images | Training / Validation / Testing road images (Cracks, Normal, Pothole) |
| `dl/models/best_model.pth.dvc` | 45 MB | Trained ResNet18 served by `dl/src/api.py` (md5 `8c2c7a72…`) |

Git stores only these small `.dvc` pointer files. The data itself lives in a **DVC remote** on Google Drive.

### 1.1 One-time setup (project owner)

Google blocks DVC's built-in Google sign-in, so the project uses its own free OAuth client.

1. **Google Cloud project:** open <https://console.cloud.google.com>, then *New project*, for example `trafficcare-dvc`.
2. **Enable the Drive API:** *APIs & Services → Library → Google Drive API → Enable*.
3. **Consent screen:** *APIs & Services → OAuth consent screen*, User type **External**, app name `TrafficCare DVC`, your e-mail. Under **Test users**, add your Google account and each teammate's.
4. **OAuth client:** *APIs & Services → Credentials → Create credentials → OAuth client ID → Application type: Desktop app*. Copy the **Client ID** and **Client secret**.
5. **Drive folder:** create a folder, for example `trafficcare-dvc`, and share it with teammates as *Editor*. Copy its ID from the URL `https://drive.google.com/drive/folders/<FOLDER_ID>`.
6. **Connect the repository:**

   ```bash
   bash scripts/setup-dvc-gdrive.sh <FOLDER_ID>
   dvc remote modify --local gdrive gdrive_client_id '<CLIENT_ID>'
   dvc remote modify --local gdrive gdrive_client_secret '<CLIENT_SECRET>'
   dvc push
   ```

   `dvc push` opens a browser once to sign in, then uploads the model (and the dataset, if `dl/datasets/raw` is present). Commit `.dvc/config`, which now names the remote. **Never commit `.dvc/config.local`**; it holds the secret and is git-ignored.

### 1.2 Teammates and examiners

```bash
pip install dvc dvc-gdrive
dvc remote modify --local gdrive gdrive_client_id '<CLIENT_ID>'      # shared privately by the owner
dvc remote modify --local gdrive gdrive_client_secret '<CLIENT_SECRET>'
dvc pull
```

Their Google account must be a *test user* on the consent screen and have access to the Drive folder.

### 1.3 Everyday commands

| Command | Meaning |
|---|---|
| `dvc status -c` | Compare local data with the remote |
| `dvc add dl/models/best_model.pth` | Track a new model version, which updates the `.dvc` file; commit it |
| `dvc push` / `dvc pull` | Upload / download data for the current commit |
| `git checkout <commit> && dvc checkout` | Restore the data that belonged to an older commit |

## 2. MLflow: experiment tracking

`dl/src/train.py` logs every training run to MLflow in experiment **`Smart-Traffic-DL-Training`**:

| Logged | Details |
|---|---|
| Parameters | model, batch size, epochs, learning rate, optimizer, loss function, number of classes, seed, device, image size, pretrained weights, training/validation image counts |
| Metrics per epoch | `train_loss`, `train_accuracy`, `val_loss`, `val_accuracy` |
| Final metric | `best_val_accuracy` |
| Tags | `dataset`, `data_dir` |
| Artifacts | best checkpoint (`model/`), training history CSV, accuracy and loss curves, run summary JSON |

Tracking is stored locally in `dl/mlflow.db` (SQLite) and `dl/mlflow_artifacts/`, both git-ignored. To view it:

```bash
cd dl
mlflow ui --backend-store-uri sqlite:///mlflow.db --port 5001
```

Then open <http://localhost:5001>.

### 2.1 Optional settings (`train.py`)

Defaults are unchanged; the variables only redirect a run.

| Variable | Default | Use |
|---|---|---|
| `DL_DATA_DIR` | `dl/datasets/raw` | Folder with `Training/` and `Validation/` class folders |
| `DL_OUTPUT_DIR` | *(none)*, which writes to `dl/models/` and `dl/results/` | Keep a run's checkpoint and results out of the committed ones |
| `DL_EPOCHS` | `10` | Number of epochs |
| `DL_RUN_NAME` | `ResNet18-Traffic-Damage` | MLflow run name |
| `DL_DATASET_NAME` | `dl/datasets/raw (DVC)` | MLflow `dataset` tag |

### 2.2 Reproducible run on public data

The original training images are in DVC. The public **CPRD** dataset (MIT licence), already used by the ML/QML comparison, gives a run anyone can repeat:

```bash
git clone --depth 1 https://github.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset.git qml/data/cprd
python qml/src/export_patches.py --variants cprd --no-verify   # 128×128 patches + grouped split
python dl/src/cprd_to_imagefolder.py                      # -> dl/datasets/cprd_imagefolder
DL_DATA_DIR=dl/datasets/cprd_imagefolder DL_OUTPUT_DIR=dl/runs/cprd \
  DL_RUN_NAME=ResNet18-CPRD DL_DATASET_NAME="CPRD (public)" python dl/src/train.py
```

`export_patches.py --no-verify` skips a feature re-computation check that can differ in the 5th decimal with newer scikit-image versions; the images are identical. The test set is the same 300 patches as in `dl/results/comparison`; the train/validation boundary (670/230) can differ slightly from the committed comparison (723/177) because scikit-learn versions shuffle grouped folds differently.

The recorded run (best validation accuracy 85.2 %) and its screenshots are in `dl/results/mlflow/`.
