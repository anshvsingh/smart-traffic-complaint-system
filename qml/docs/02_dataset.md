# 2. Dataset selection and documentation

## Summary (the fields we were asked to record)

| Field | Value |
|---|---|
| **Dataset name** | Cracks and Potholes in Road Images (Passos, Cassaniga, Fernandes, Medeiros, Comunello — UNIVALI, Brazil, 2020) |
| **Source link** | https://github.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset (also Mendeley Data, DOI [10.17632/t576ydh9v8.4](https://data.mendeley.com/datasets/t576ydh9v8/4)) · licence: MIT |
| **Raw data** | 2,235 highway photos (1024×640) from Brazil's road-survey vehicles, each with 3 pixel masks: LANE, CRACK, POTHOLE |
| **What we classify** | 128×128 patches of road surface cut from those photos |
| **Number of classes** | 3 — `Cracks` (app: "Road Damage"), `Normal` ("Normal Road"), `Pothole` ("Pothole") — **the same three class folders Arnav's DL model uses** |
| **Number of samples used** | 1,200 patches: train 900 (300 per class), test 300 (100 per class), from 897 different photos |
| **Candidate pool** | 12,997 labelled patches extracted (Normal 6,609 · Cracks 5,432 · Pothole 956); balanced random sample taken from it |
| **Features used** | 16 hand-crafted features per patch (below) → PCA to 8 → rescaled to angles in [0, π] for the 4-qubit circuit |
| **Train/test split** | By **500 m stretch of road**: 111 stretches in train, 30 in test; no stretch on both sides. Stricter check: by whole highway section (20 train / 7 test) |
| **Test data used in training?** | No. All scaling, PCA, hyper-parameters and the number of VQC layers were fitted/chosen on training data only (CV or a validation split of the training stretches). |

## Why this dataset (and how it connects to Arnav's)

- Arnav's DL module (`dl/`) classifies `Cracks / Normal / Pothole` images (≈6,000 images at 256×256, folders `Training / Validation / Testing`). Those images live in `dl/datasets/`, which is git-ignored, so they are not in the repository.
- The QML code reads **both**:
  - `--source cprd` (default, public, reproducible by anyone from GitHub), and
  - `--source dl` — Arnav's folders directly: `python qml/src/preprocessing.py --source dl --dl-root dl/datasets/raw`. His `Training + Validation` become our train set and his `Testing` stays our test set, so the QML experiment never sees his test images during training.
- **Action for the team:** ask Arnav for the original source link of his dataset so it can be recorded in `dl/README.md` (currently empty), and run the `--source dl` version once so the QML and DL numbers are on the same images.

The CPRD dataset was chosen because it is real road imagery, has the exact same three classes, has a permissive licence, and — unlike most pothole datasets — has pixel masks, so every patch label can be derived objectively instead of by hand.

## How patches are labelled (`qml/src/preprocessing.py`)

For every photo, a 128×128 window slides over the image in steps of 64 px. A window is kept only if ≥ 95 % of it is on the road (LANE mask). Then:

| Label | Rule |
|---|---|
| `Pothole` | ≥ 8 % of the patch pixels are POTHOLE |
| `Cracks` | no pothole pixels and ≥ 1.5 % CRACK pixels (cracks are thin lines, so 1.5 % is already a clear crack) |
| `Normal` | no crack or pothole pixels in the patch **or within 16 px around it** |
| skipped | anything in between (a few damage pixels) — ambiguous |

At most 3 patches per class are taken from one photo, so a single photo cannot dominate. Example patches: `results/graphs/dataset_samples.png`.

## Features (16 per patch)

All computed on the patch resized to 128×128:

| Group | Features | Why it helps |
|---|---|---|
| Brightness | mean, standard deviation, skewness of grey levels; share of clearly dark pixels | potholes and their shadows are darker than the surrounding asphalt |
| Edges | Sobel gradient mean and std; Canny edge density; Laplacian variance | cracks are thin dark lines → many edges |
| Texture (GLCM) | contrast, homogeneity, energy, correlation (grey-level co-occurrence, 4 directions) | smooth new asphalt vs rough damaged surface |
| Texture (LBP) | entropy of uniform local binary patterns | richness of local texture |
| Colour | mean HSV saturation; std of HSV value | wet/dirty potholes and patched areas change colour |
| Shape | border brightness minus centre brightness | bowl-shaped holes are darker in the middle |

## Preprocessing for the models

1. `StandardScaler` — every feature to mean 0, std 1 (fit on train).
2. `PCA(8)` — 16 → 8 numbers (fit on train). 8 because the circuit encodes two numbers per qubit (RY and RZ angles) on 4 qubits.
3. `MinMaxScaler(0, π)` + clip — each number becomes a rotation angle (fit on train; test values outside the train range are clipped).

The classical baselines are reported twice: on all 16 standardised features, and on exactly the same 8 angles the quantum models get.

## Why the split is by road stretch, not random

Photos are taken every ~5 m, so neighbouring photos — and patches from them — look almost identical. A random split would put near-duplicates in train and test and inflate every score. Grouping by 500 m stretch removes that leak while every highway can still appear in training (like training on some streets of a city and testing on others). The stricter "completely unseen highway" split is reported separately as a robustness check; it is harder because lighting, asphalt colour and camera differ between highways.

## Files

| File | In git? | Content |
|---|---|---|
| `qml/data/features_cprd.csv` | yes (0.5 MB) | 1,200 rows: sample id, photo id, highway section, 500 m group, label, split, 16 features |
| `qml/data/features_cprd_unseen_highway.csv` | yes (0.5 MB) | same, split by whole highway section |
| `qml/data/cprd/` | **no** (489 MB, git-ignored) | the raw dataset — re-create with `git clone --depth 1 https://github.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset.git qml/data/cprd` |

## Citation

Passos, B. T., Cassaniga, M. J., Fernandes, A. M. R., Medeiros, K. B., Comunello, E. (2020). *Cracks and Potholes in Road Images*. Mendeley Data, V4. doi:10.17632/t576ydh9v8.4. Images provided by the Brazilian National Department of Transport Infrastructure (DNIT).
