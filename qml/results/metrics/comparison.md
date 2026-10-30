## Headline comparison

| Metric | Classical ML — best by CV, 16 features | Classical ML — best by CV, same 8 features | QML — VQC | QML — QSVM |
|---|---|---|---|---|
| Model | Classical: Random Forest, 16 features | Classical: SVM (RBF), same 8 features as QML | QML: VQC, 4 qubits, 3 layers | QML: QSVM, quantum kernel, 4 qubits |
| Accuracy | 0.730 | 0.703 | 0.593 | 0.680 |
| Precision (macro) | 0.746 | 0.714 | 0.609 | 0.689 |
| Recall (macro) | 0.730 | 0.703 | 0.593 | 0.680 |
| F1-score (macro) | 0.732 | 0.705 | 0.588 | 0.681 |
| Training time (s) | 0.44 | 0.02 | 128.71 | 0.06 |
| Inference time (ms/sample) | 0.181 | 0.020 | 0.028 | 0.043 |

## All models

| Model | Type | Accuracy | Precision | Recall | F1 | Training time (s) | Inference (ms/sample) |
|---|---|---|---|---|---|---|---|
| Logistic Regression (16 feat.) | Classical | 0.683 | 0.684 | 0.683 | 0.683 | 0.02 | 0.001 |
| Logistic Regression (8 PCA feat.) | Classical | 0.650 | 0.651 | 0.650 | 0.650 | 0.01 | 0.003 |
| SVM (RBF) (16 feat.) | Classical | 0.737 | 0.749 | 0.737 | 0.737 | 0.02 | 0.019 |
| SVM (RBF) (8 PCA feat.) | Classical | 0.703 | 0.714 | 0.703 | 0.705 | 0.02 | 0.020 |
| Random Forest (16 feat.) | Classical | 0.730 | 0.746 | 0.730 | 0.732 | 0.44 | 0.181 |
| Random Forest (8 PCA feat.) | Classical | 0.677 | 0.683 | 0.677 | 0.678 | 0.40 | 0.185 |
| VQC (4 qubits) | Quantum (simulated) | 0.593 | 0.609 | 0.593 | 0.588 | 128.71 | 0.028 |
| QSVM, quantum kernel (4 qubits) | Quantum (simulated) | 0.680 | 0.689 | 0.680 | 0.681 | 0.06 | 0.043 |
