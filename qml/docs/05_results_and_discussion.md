# 5. Results: classical ML vs QML

All numbers are from `qml/results/metrics/*.json`, produced by the scripts in `qml/src/` on 30 Oct 2026. Test set: 300 road patches (100 per class) from road stretches never used in training. Precision, recall and F1 are macro averages over the 3 classes. Quantum models are **exact classical simulations** of a 4-qubit circuit.

## 5.1 Comparison table (main experiment)

| Metric | Classical ML (best by CV, all 16 features: Random Forest) | Classical ML (best by CV, same 8 features as QML: SVM-RBF) | QML: VQC (4 qubits, 3 layers) | QML: QSVM (quantum kernel, 4 qubits) |
|---|---|---|---|---|
| Accuracy | **0.730** | 0.703 | 0.593 | 0.680 |
| Precision | **0.746** | 0.714 | 0.609 | 0.689 |
| Recall | **0.730** | 0.703 | 0.593 | 0.680 |
| F1-score | **0.732** | 0.705 | 0.588 | 0.681 |
| Training time | 0.44 s | 0.02 s | 128.7 s | 0.06 s |
| Inference time | 0.18 ms/sample | 0.02 ms/sample | 0.03 ms/sample | 0.04 ms/sample |

"Best by CV" = chosen by cross-validation on the training set, not by test score. The best *test* scores among classical models were SVM-RBF on 16 features (acc 0.737) — we report the CV pick to avoid choosing with the test set. Training time = final fit only (hyper-parameter search excluded for every model). All six classical runs: `results/metrics/comparison.md`.

Graphs: `results/graphs/comparison_metrics.png`, `comparison_per_class_f1.png`, `comparison_time.png`, `confusion_matrices.png`, `quantum_vqc_selection.png`, `quantum_vqc_training_curve.png`.

### Per-class F1

| Class | RF (16 feat.) | SVM (8 feat.) | VQC | QSVM |
|---|---|---|---|---|
| Cracks (Road Damage) | 0.71 | 0.67 | 0.61 | 0.65 |
| Normal Road | 0.77 | 0.75 | 0.65 | 0.72 |
| Pothole | 0.71 | 0.69 | 0.50 | 0.67 |

The most common mistake for every model is a pothole predicted as cracks (28–44 of 100 potholes): alligator cracking and shallow potholes look alike at 128×128.

## 5.2 Robustness check: highways never seen in training

Same pipeline, split by whole highway section (20 sections train / 7 test). VQC uses the layers and learning rate chosen in the main experiment.

| Metric | RF (16 feat.) | SVM-RBF (8 feat.) | VQC | QSVM |
|---|---|---|---|---|
| Accuracy | **0.613** | 0.497 | 0.497 | 0.483 |
| F1-score | **0.575** | 0.454 | 0.415 | 0.463 |

Everything drops 10–20 points: lighting, asphalt colour and camera change between highways and hand-crafted features don't transfer well. The VQC almost never predicts *Cracks* on new highways (F1 0.02), which is why its precision is only 0.38. Full table: `results/metrics/comparison_unseen_highway.md`.

## 5.3 Which model performed better?

**Classical ML.** The Random Forest on all 16 features is the best overall (F1 0.73). On the exact same 8 inputs the quantum models get, the classical SVM (F1 0.71) still beats both quantum models.

## 5.4 Was QML competitive?

- **QSVM: yes, roughly.** F1 0.68 vs 0.71 for the classical SVM on identical inputs — 2–3 points behind, within what you'd expect from a different kernel. It trains in well under a second in simulation.
- **VQC: not yet.** F1 0.59, about 12 points behind the classical model on the same inputs, and thousands of times slower to train in simulation (129 s vs 0.02 s for the SVM). It clearly learns (chance is 0.33), but it confuses potholes with cracks much more than the others (pothole recall 0.42).

**No quantum advantage is claimed or shown.** A 4-qubit circuit can be simulated exactly on a laptop, so by definition there is nothing here a classical computer cannot do; the experiment shows that small quantum models *can* be trained on our project's data and how they compare, not that they are better.

## 5.5 Limitations observed

1. **Tiny circuit.** 4 qubits and 30 parameters (24 quantum + 6 classical) vs hundreds of trees in the RF. 16 features had to be squeezed to 8 with PCA, which by itself costs the classical SVM ~3 F1 points.
2. **Noisy VQC training / optimistic selection.** Validation F1 jumps around by ±0.05 from epoch to epoch (`quantum_vqc_selection.png`). Picking the single best epoch picked a spike (0.69); the plateau is ~0.62–0.65, and the test result (0.59) is consistent with that. An earlier run (lr 0.05 only, 4 layers chosen) gave test acc 0.587 — kept in `results/metrics/run1_initial/` for transparency. The final protocol then tuned layers and learning rate on validation data only.
3. **Simulation cost.** The parameter-shift rule needs 2 circuit runs per parameter per batch (48 runs for 24 parameters). On real hardware every one of those runs would need thousands of shots, so training would be far slower still.
4. **No hardware noise.** Real quantum devices add gate errors and shot noise; our numbers are a best case.
5. **Hand-crafted features + domain shift.** All models struggle on unseen highways (5.2). This limits every model, not just QML.
6. **Small data on purpose.** 900 training patches keep the simulation small; classical models would gain more than QML from using the full ~13,000-patch pool.
7. **Different dataset from the DL module.** Arnav's images are not in the repo; the same code can run on them (`--source dl`), but this has not been done yet.
8. **PennyLane cross-check pending.** The PennyLane backend is implemented but could not be installed where these results were produced; `python qml/src/quantum_model.py --check-pennylane` must be run once on Colab/laptop.

## 5.6 Possible improvements

- **Better optimisation:** learning-rate decay, averaging over 3–5 random initialisations, and selecting by a smoothed validation curve instead of the single best epoch.
- **Better inputs:** feed CNN embeddings from Arnav's ResNet18 (512-d → PCA 8) into the same circuit; supervised reduction (LDA) instead of PCA.
- **More qubits / richer encoding:** 6–8 qubits (simulation still cheap), trainable encoding weights, IQP or ZZ-feature-map style encodings for the QSVM.
- **Hybrid QNN:** a quantum layer as the head of a small CNN with PennyLane `TorchLayer` (GPU needed).
- **Realism:** run with finite shots and a noise model (`default.mixed` in PennyLane), then try a free IBM Quantum device with Qiskit for inference on a handful of samples.
- **Evaluation:** repeat with several random seeds/splits and report mean ± std; run on Arnav's dataset for a direct DL vs QML comparison.
