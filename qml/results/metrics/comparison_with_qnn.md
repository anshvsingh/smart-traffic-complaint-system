## All models incl. QNNs - main split (500 m road stretches)

300 held-out test patches. Single headline run (seed 42) per model; the seed column repeats the training with other initialisations. Hybrid training time excludes the one-off backbone feature caching for the frozen setting; hybrid inference is end-to-end (resize + ResNet18 on GPU + middle layer).

| Inputs | Model | Type | Accuracy | Precision | Recall | F1 | F1 mean ± sd (seeds) | Training time (s) | Inference (ms/sample) |
|---|---|---|---|---|---|---|---|---|---|
| hand-crafted features | Random Forest (16 features) | Classical | 0.730 | 0.746 | 0.730 | 0.732 | — | 0.44 | 0.181 |
| hand-crafted features | SVM (RBF) (same 8 angles) | Classical | 0.703 | 0.714 | 0.703 | 0.705 | — | 0.02 | 0.020 |
| hand-crafted features | VQC, 4 qubits | Quantum (sim.) | 0.593 | 0.609 | 0.593 | 0.588 | — | 128.71 | 0.028 |
| hand-crafted features | QSVM, quantum kernel | Quantum (sim.) | 0.680 | 0.689 | 0.680 | 0.681 | — | 0.06 | 0.043 |
| hand-crafted features | QNN, 4 qubits, 2 layers | Quantum (sim.) | 0.663 | 0.661 | 0.663 | 0.662 | 0.613 ± 0.019 (n=5) | 21.15 | 0.040 |
| hand-crafted features | Classical control MLP 8-4-3 | Classical | 0.683 | 0.694 | 0.683 | 0.679 | 0.645 ± 0.033 (n=5) | 0.47 | 0.001 |
| image patches (ResNet18 frozen) | + quantum layer (4 qubits) | Hybrid quantum (sim.) | 0.817 | 0.818 | 0.817 | 0.817 | 0.807 ± 0.016 (n=5) | 45.74 | 1.824 |
| image patches (ResNet18 frozen) | + classical control layer | Classical | 0.807 | 0.811 | 0.807 | 0.808 | 0.787 ± 0.064 (n=5) | 3.73 | 1.740 |
| image patches (ResNet18 frozen) | + no middle layer | Classical | 0.773 | 0.778 | 0.773 | 0.774 | 0.749 ± 0.086 (n=5) | 3.72 | 1.731 |
| image patches (ResNet18 fine-tuned layer4) | + quantum layer (4 qubits) | Hybrid quantum (sim.) | 0.830 | 0.840 | 0.830 | 0.830 | 0.761 ± 0.101 (n=3) | 83.00 | 1.935 |
| image patches (ResNet18 fine-tuned layer4) | + classical control layer | Classical | 0.847 | 0.848 | 0.847 | 0.847 | 0.835 ± 0.017 (n=3) | 63.56 | 1.437 |
