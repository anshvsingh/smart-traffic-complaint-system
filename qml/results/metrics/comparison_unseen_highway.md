## Headline comparison

| Metric | Classical ML — best by CV, 16 features | Classical ML — best by CV, same 8 features | QML — VQC | QML — QSVM |
|---|---|---|---|---|
| Model | Classical: Random Forest, 16 features | Classical: SVM (RBF), same 8 features as QML | QML: VQC, 4 qubits, 3 layers | QML: QSVM, quantum kernel, 4 qubits |
| Accuracy | 0.613 | 0.497 | 0.497 | 0.483 |
| Precision (macro) | 0.643 | 0.547 | 0.383 | 0.608 |
| Recall (macro) | 0.613 | 0.497 | 0.497 | 0.483 |
| F1-score (macro) | 0.575 | 0.454 | 0.415 | 0.463 |
| Training time (s) | 0.36 | 0.02 | 136.72 | 0.05 |
| Inference time (ms/sample) | 0.080 | 0.019 | 0.022 | 0.039 |

## All models

| Model | Type | Accuracy | Precision | Recall | F1 | Training time (s) | Inference (ms/sample) |
|---|---|---|---|---|---|---|---|
| Logistic Regression (16 feat.) | Classical | 0.467 | 0.480 | 0.467 | 0.411 | 0.03 | 0.002 |
| Logistic Regression (8 PCA feat.) | Classical | 0.463 | 0.490 | 0.463 | 0.409 | 0.03 | 0.004 |
| SVM (RBF) (16 feat.) | Classical | 0.540 | 0.628 | 0.540 | 0.529 | 0.02 | 0.025 |
| SVM (RBF) (8 PCA feat.) | Classical | 0.497 | 0.547 | 0.497 | 0.454 | 0.02 | 0.019 |
| Random Forest (16 feat.) | Classical | 0.613 | 0.643 | 0.613 | 0.575 | 0.36 | 0.080 |
| Random Forest (8 PCA feat.) | Classical | 0.453 | 0.502 | 0.453 | 0.412 | 0.33 | 0.089 |
| VQC (4 qubits) | Quantum (simulated) | 0.497 | 0.383 | 0.497 | 0.415 | 136.72 | 0.022 |
| QSVM, quantum kernel (4 qubits) | Quantum (simulated) | 0.483 | 0.608 | 0.483 | 0.463 | 0.05 | 0.039 |
