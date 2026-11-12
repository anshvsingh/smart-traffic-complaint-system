# TrafficCare - Deep Learning module (`dl/`)

Road-condition image classifier behind the TrafficCare complaint system. An uploaded road photo is
classified into one of three classes:

| Folder / class id | Shown in the app |
|---|---|
| `Cracks` | Road Damage |
| `Normal` | Normal Road |
| `Pothole` | Pothole |

The production model is a **ResNet18** (ImageNet-pretrained, fine-tuned), served by a small FastAPI
service (`src/api.py`) that the Node.js backend calls.

As a second deliverable, `src/compare_models.py` compares ResNet18 with two more CNNs,
**EfficientNet-B0** and **MobileNetV3-Large**, on identical data. The test set is the same 300 patches
that the classical and quantum models in `qml/` are scored on.
Write-up: [`docs/02_model_comparison.md`](docs/02_model_comparison.md).

## Layout

```
dl/
  src/
    train.py               ResNet18 training on dl/datasets/raw (MLflow logging)
    evaluate.py            test-set metrics + confusion matrix for models/best_model.pth
    predict.py             classify one image from the command line
    sample_predictions.py  grid of example predictions
    inspect_dataset.py, visualize_dataset.py, check_duplicates.py   dataset checks
    api.py                 FastAPI service: GET /, GET /health, POST /predict
    model_zoo.py           ResNet18 / EfficientNet-B0 / MobileNetV3-Large builders + checkpoint loader
    compare_models.py      3-model comparison on the shared CPRD patches
  tests/test_api.py        API tests (unittest / pytest)
  models/                  best_model.pth (DVC), comparison/*.pth (git-ignored)
  results/                 metrics and plots of the original ResNet18 run
  results/comparison/      metrics, tables and figures of the model comparison
  docs/02_model_comparison.md
```

## Setup

```bash
pip install -r dl/requirements.txt          # CPU is fine for the API
# GPU training: install the CUDA build of torch/torchvision from pytorch.org first
```

The original dataset (`dl/datasets/raw/{Training,Validation,Testing}/{Cracks,Normal,Pothole}`) and
`models/best_model.pth` are tracked with DVC: `dvc pull` (needs access to the DVC remote).

## Original ResNet18 pipeline

```bash
cd dl
python src/train.py          # -> models/best_model.pth, results/*_curve.png, training_history.csv
python src/evaluate.py       # -> results/test_metrics.json, results/confusion_matrix.png
python src/predict.py --image path/to/road.jpg
uvicorn src.api:app --host 0.0.0.0 --port 8000   # http://localhost:8000/health
```

`api.py` loads `models/best_model.pth` by default. To serve another ResNet18 checkpoint in the
same format, set `DL_MODEL_PATH`, e.g. `DL_MODEL_PATH=models/comparison/resnet18_cprd.pth`.
Docker: `docker build -t trafficcare-dl dl && docker run -p 8000:8000 trafficcare-dl`.

## Model comparison (ResNet18 vs EfficientNet-B0 vs MobileNetV3-Large)

Data: the public CPRD dataset (Cracks and Potholes in Road Images, MIT licence), cut into 128x128
road patches by `qml/src/preprocessing.py`. Run these from the repository root:

```bash
git clone --depth 1 https://github.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset.git qml/data/cprd
python qml/src/export_patches.py           # PNG patches + manifest.csv for both split variants
python -u dl/src/compare_models.py         # train/evaluate 3 models x 2 split variants x 3 seeds
python dl/src/compare_models.py --report-only   # rebuild tables and figures from saved metrics
python dl/src/compare_models.py --bench-only    # re-time inference from saved checkpoints
```

Options: `--variants cprd cprd_unseen_highway`, `--models resnet18 efficientnet_b0 mobilenet_v3_large`,
`--seeds 42 43 44`, `--epochs 30`, `--patience 8`, `--batch-size 32`, `--cpu`.

Outputs in `results/comparison/`:

* `metrics_<variant>.json`: all metrics, per-seed results, timings, peak VRAM, McNemar tests
* `comparison_<variant>.md`: result tables, including the `qml/` classical and quantum models
* `confusion_matrices_<variant>.png`, `training_curves_<variant>.png`, `comparison_bars_<variant>.png`
* `history_<model>_<variant>.csv`: per-epoch loss, accuracy and macro-F1

Results and discussion: [`docs/02_model_comparison.md`](docs/02_model_comparison.md),
[`results/comparison/comparison_cprd.md`](results/comparison/comparison_cprd.md),
[`results/comparison/comparison_cprd_unseen_highway.md`](results/comparison/comparison_cprd_unseen_highway.md).

## Tests

```bash
cd dl
python -m pytest tests -q
```

`src/api.py` loads the model when it is imported, so the tests need a ResNet18 checkpoint:
either `models/best_model.pth` (`dvc pull`) or `DL_MODEL_PATH` pointing at
`models/comparison/resnet18_cprd.pth`. The prediction test itself uses a fake model.
