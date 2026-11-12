## All models incl. QNNs - unseen-highway split

300 held-out test patches. Single headline run (seed 42) per model; the seed column repeats the training with other initialisations. Hybrid training time excludes the one-off backbone feature caching for the frozen setting; hybrid inference is end-to-end (resize + ResNet18 on GPU + middle layer).

| Inputs | Model | Type | Accuracy | Precision | Recall | F1 | F1 mean ± sd (seeds) | Training time (s) | Inference (ms/sample) |
|---|---|---|---|---|---|---|---|---|---|
| hand-crafted features | Random Forest (16 features) | Classical | 0.613 | 0.643 | 0.613 | 0.575 | — | 0.36 | 0.080 |
| hand-crafted features | SVM (RBF) (same 8 angles) | Classical | 0.497 | 0.547 | 0.497 | 0.454 | — | 0.02 | 0.019 |
| hand-crafted features | VQC, 4 qubits | Quantum (sim.) | 0.497 | 0.383 | 0.497 | 0.415 | — | 136.72 | 0.022 |
| hand-crafted features | QSVM, quantum kernel | Quantum (sim.) | 0.483 | 0.608 | 0.483 | 0.463 | — | 0.05 | 0.039 |
| hand-crafted features | QNN, 4 qubits, 2 layers | Quantum (sim.) | 0.410 | 0.453 | 0.410 | 0.353 | 0.315 ± 0.069 (n=5) | 13.69 | 0.032 |
| hand-crafted features | Classical control MLP 8-4-3 | Classical | 0.493 | 0.402 | 0.493 | 0.412 | 0.356 ± 0.051 (n=5) | 0.18 | 0.000 |
| image patches (ResNet18 frozen) | + quantum layer (4 qubits) | Hybrid quantum (sim.) | 0.720 | 0.755 | 0.720 | 0.701 | 0.750 ± 0.030 (n=5) | 25.11 | 1.805 |
| image patches (ResNet18 frozen) | + classical control layer | Classical | 0.770 | 0.800 | 0.770 | 0.763 | 0.773 ± 0.034 (n=5) | 5.35 | 0.591 |
| image patches (ResNet18 frozen) | + no middle layer | Classical | 0.720 | 0.757 | 0.720 | 0.703 | 0.700 ± 0.083 (n=5) | 1.86 | 1.690 |
| image patches (ResNet18 fine-tuned layer4) | + quantum layer (4 qubits) | Hybrid quantum (sim.) | 0.810 | 0.815 | 0.810 | 0.803 | 0.757 ± 0.058 (n=3) | 87.00 | 1.725 |
| image patches (ResNet18 fine-tuned layer4) | + classical control layer | Classical | 0.817 | 0.836 | 0.817 | 0.818 | 0.827 ± 0.016 (n=3) | 38.86 | 1.705 |
