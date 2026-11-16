# MLflow run evidence

A real training run tracked with MLflow on 17 November 2026 (`dl/src/train.py`, experiment **`Smart-Traffic-DL-Training`**).

| Item | Value |
|---|---|
| Run | `ResNet18-CPRD`, run ID `6325561035864049b1ed50dcc201d395`, status **Finished** |
| Data | Public CPRD road patches (MIT licence): Training 670, Validation 230 images (Cracks / Normal / Pothole), built with `dl/src/cprd_to_imagefolder.py` |
| Model | ResNet18, ImageNet-pretrained, fine-tuned |
| Parameters | 10 epochs, batch 16, Adam, learning rate 0.0001, CrossEntropyLoss, seed 42, 224×224, device `mps` (Apple GPU) |
| Duration | 1 min 58 s |
| Best validation accuracy | **85.2 %** (epoch 8) |
| Final epoch | train accuracy 95.7 %, validation accuracy 81.3 % |

| Epoch | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Train accuracy (%) | 64.2 | 79.6 | 86.6 | 89.3 | 90.7 | 91.2 | 92.1 | 94.8 | 94.0 | 95.7 |
| Validation accuracy (%) | 67.4 | 78.3 | 79.1 | 80.9 | 79.6 | 84.8 | 77.0 | **85.2** | 82.6 | 81.3 |

## Files

| File | Content |
|---|---|
| `01-experiment-runs.png` | MLflow UI: runs of the experiment |
| `02-run-overview.png` | Run overview: metrics, 13 parameters, tags, source commit |
| `03-model-metrics-charts.png` | Per-epoch charts of train/validation loss and accuracy |
| `04-artifacts.png` | Logged artifacts: model, class mapping, curves, history, summary. The local folder path is masked |
| `accuracy_curve.png`, `loss_curve.png` | Curves logged as artifacts |
| `run-ResNet18-CPRD.json` | Exported run record: parameters, tags, final and per-epoch metrics |

The MLflow database (`dl/mlflow.db`) and artifact store (`dl/mlflow_artifacts/`) stay local and are git-ignored. To view the runs: `cd dl && mlflow ui --backend-store-uri sqlite:///mlflow.db --port 5001`.

This run demonstrates experiment tracking on data anyone can download. It does not replace the production model (`dl/models/best_model.pth`, trained on the DVC dataset). How to reproduce: `dl/docs/03_dvc_and_mlflow.md` §2.2.
