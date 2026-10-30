# 3. Implementation plan — for team review

This is the "share before full implementation" summary the brief asked for. A first working version of every step already exists on branch `feature/qml-testing` so the review can look at real numbers; nothing is merged until the team agrees.

## What I'm proposing

| Item | Proposal |
|---|---|
| **Selected QML algorithm** | Variational Quantum Classifier (VQC) with data re-uploading — main model. Quantum-kernel SVM (QSVM) as a second, training-free quantum model. Reasons: `01_algorithm_research.md`. |
| **Dataset** | *Cracks and Potholes in Road Images* — https://github.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset (MIT). 3 classes identical to Arnav's (Cracks / Normal / Pothole). Code also reads Arnav's `dl/datasets/raw` folders (`--source dl`). Details: `02_dataset.md`. |
| **Model architecture** | 16 image features → StandardScaler → PCA(8) → angles in [0, π] → 4 qubits, dense angle encoding (RY+RZ per qubit) re-uploaded in each layer → trainable RY+RZ per qubit → CNOT ring → ⟨Z⟩ on qubits 0–2 → trainable scale + bias → softmax. Layers and learning rate chosen on validation (result: 3 layers, lr 0.1, 24 quantum + 6 classical parameters). Details: `04_quantum_circuit_explained.md`. |
| **Training** | Cross-entropy, Adam, batch 32, parameter-shift gradients. |
| **Baselines** | Logistic Regression, SVM (RBF), Random Forest — each on all 16 features and on the identical 8 angles. Hyper-parameters by GroupKFold CV on training data. |
| **Evaluation** | One look at a 300-patch test set split by road stretch: accuracy, macro precision/recall/F1, confusion matrix, training and inference time. Plus a stricter unseen-highway split. |
| **Tools & libraries** | Python 3.10+, NumPy, pandas, scikit-learn, scikit-image, Pillow, Matplotlib, PennyLane (reference backend), Jupyter / Google Colab. |

## Step-by-step plan and status

| # | Step | Output | Status |
|---|---|---|---|
| 1 | Research VQC, QSVM, hybrid QNN | `docs/01_algorithm_research.md` | Done |
| 2 | Pick dataset, align classes with Arnav | `docs/02_dataset.md`, `src/preprocessing.py` | Done (CPRD). **Open:** run `--source dl` on Arnav's images once he shares them / confirms the source |
| 3 | Feature extraction + leak-free split | `data/features_cprd.csv` | Done |
| 4 | Python environment | `requirements.txt` | Done |
| 5 | Classical baseline | `src/classical_model.py`, `notebooks/classical_baseline.ipynb` | Done |
| 6 | VQC implementation (NumPy simulator + PennyLane backend, self-tests) | `src/quantum_model.py` | Done (NumPy). **Open:** run `--check-pennylane` once on Colab/laptop — PennyLane could not be installed in the environment that produced the results |
| 7 | QSVM | `src/quantum_model.py` | Done |
| 8 | Comparison table + graphs | `src/evaluation.py`, `results/` | Done |
| 9 | Limitations / improvements | `docs/05_results_and_discussion.md` | Done (draft) |
| 10 | Team review | — | **Next** |
| 11 | After review: possible extensions | e.g. CNN features from Arnav's ResNet18 into the VQC; 6–8 qubits; shot noise | Not started |

## Things to decide together

1. **Dataset**: keep CPRD as the public, reproducible QML dataset, or switch the headline numbers to Arnav's images (`--source dl`)? Code supports both.
2. **Which split is the headline**: 500 m stretches (default) or unseen highways (harder)? I report both.
3. **How far to go**: the current small experiment answers the brief. Option for later: feed Arnav's CNN features (512-d → PCA 8) into the same circuit — likely much higher accuracy for both classical and quantum, but then the CNN does most of the work.

## How to reproduce

```bash
pip install -r qml/requirements.txt
git clone --depth 1 https://github.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset.git qml/data/cprd   # 489 MB, git-ignored
python qml/src/preprocessing.py                     # ~2 min  -> qml/data/features_cprd.csv (already committed)
python qml/src/classical_model.py                   # ~30 s
python qml/src/quantum_model.py --self-test         # seconds
python qml/src/quantum_model.py                     # ~25 min on CPU (VQC selection + final + QSVM)
python qml/src/evaluation.py --samples              # comparison table + graphs
# optional, needs PennyLane:
python qml/src/quantum_model.py --check-pennylane
```

The committed feature CSV means steps 1–2 can be skipped: the models can be re-run without downloading any images.
