# 1. QML algorithm research — VQC vs QSVM vs hybrid quantum-classical networks

**Decision: Variational Quantum Classifier (VQC), built with PennyLane-compatible gates, as the main model. QSVM (quantum kernel) is run as a cheap second quantum baseline.**

## The three candidates in one paragraph each

**Variational Quantum Classifier (VQC).** Classical features are written into a few qubits as rotation angles ("encoding"). A short circuit of rotation gates with *trainable* angles plus entangling CNOT gates follows. Measuring the qubits gives numbers between −1 and 1 that are turned into class scores. A classical optimiser (Adam) adjusts the trainable angles to reduce the classification loss. Gradients come from the *parameter-shift rule*, which is how gradients are obtained on real quantum hardware. It is the quantum analogue of a small neural network.

**Quantum Support Vector Machine (QSVM / quantum kernel).** Nothing is trained inside the circuit. Each sample x is encoded into a quantum state |φ(x)⟩ and the similarity of two samples is the overlap |⟨φ(x)|φ(x′)⟩|². That similarity matrix (the "kernel") is handed to an ordinary SVM. Training = computing an N×N kernel matrix + a normal SVM fit.

**Hybrid classical-quantum neural network (QNN).** A classical network (e.g. a CNN like Arnav's ResNet18) produces features, a variational quantum layer sits somewhere in the middle or at the end, and the whole thing is trained end-to-end with PyTorch + PennyLane's `TorchLayer`. A VQC with classical pre/post-processing is the smallest version of this.

## Comparison on the criteria we were asked to use

| Criterion | VQC | QSVM (quantum kernel) | Hybrid CNN + quantum layer |
|---|---|---|---|
| **Implementation complexity** | Low–medium: encoding + ansatz + optimiser loop. ~150 lines. | Low: build a kernel matrix, call `SVC(kernel="precomputed")`. | High: needs PyTorch, data loaders, GPU, `TorchLayer` plumbing; most of the code is the CNN. |
| **Dataset requirements** | Small tabular inputs: one or two features per qubit (we use 8 features on 4 qubits). Hundreds of samples are enough. | Same small feature vectors. Cost grows with N² so it is limited to roughly a few thousand samples. | Raw images and thousands of them (Arnav uses ~6,000). |
| **Computational requirements** | Simulation cost ~2ⁿ per circuit; for 4 qubits this is tiny. Training needs 2 circuit runs per parameter per step (parameter shift), so it is slower than classical models but fine on a laptop/Colab CPU. | One circuit per sample pair: N² kernel entries. 900 training samples → 0.8 M overlaps — fast in simulation, *very* expensive on real hardware. | Heaviest: CNN training + simulated quantum layer inside every forward/backward pass. |
| **Suitability for classification** | Direct multi-class output (one measured qubit per class). | Good, SVMs are strong classifiers; multi-class handled by sklearn (one-vs-one). | Good but the CNN does almost all the work, so it is hard to tell what the quantum part contributes. |
| **Ease of experimentation** | High: change layers, learning rate, encoding, qubits; every piece can be explained in the viva. | High for the kernel, but there is nothing to "train" in the quantum part, so less to discuss. | Low: long runs, many moving parts, hard to attribute results. |

## Why VQC

1. It is the recommended starting point in the brief and in the PennyLane tutorials, and it is a genuine *trainable* quantum model, so the viva questions ("how does the model learn?") have a real answer.
2. It works on the small feature vectors we can produce from road images, which keeps the comparison with classical ML on **identical inputs** — the only fair comparison.
3. It runs in minutes on a CPU (Colab or a laptop) with 4 qubits.
4. It keeps the quantum part separate from Arnav's CNN, so the DL and QML results are independent pieces of the project rather than one blended system.

QSVM was added because it costs ~20 lines once the encoding circuit exists, and gives a second, training-free quantum result to compare against.

A hybrid CNN + quantum layer is listed as future work (see `05_results_and_discussion.md`): it only makes sense once the small VQC is understood and only with a GPU.

## Libraries

| Library | Used for |
|---|---|
| **PennyLane** (`default.qubit`) | Reference implementation of the VQC circuit (`--backend pennylane`) — run in Colab or locally |
| NumPy | Our own 4-qubit state-vector simulator (default backend; produced the committed results, verified against brute-force matrices and against PennyLane with `--check-pennylane`) |
| scikit-learn | Classical baselines, PCA, scaling, CV, metrics, SVM for QSVM |
| scikit-image / Pillow | Feature extraction from road images |
| Matplotlib | Graphs |
| Qiskit | Not used — PennyLane covers the same need and integrates directly with NumPy/PyTorch. Could be used later to run the same circuit on IBM hardware. |

## Sources

- PennyLane documentation — https://docs.pennylane.ai/ (templates, `default.qubit`, parameter broadcasting, gradients)
- PennyLane demos: "Variational classifier", "Data re-uploading classifier", "Kernel-based training of quantum models" — https://pennylane.ai/qml/demonstrations
- Qiskit documentation — https://quantum.cloud.ibm.com/docs
- Schuld, M., Bocharov, A., Svore, K., Wiebe, N. (2020). *Circuit-centric quantum classifiers.* Phys. Rev. A 101, 032308.
- Havlíček, V. et al. (2019). *Supervised learning with quantum-enhanced feature spaces.* Nature 567, 209–212. (quantum kernels / QSVM)
- Pérez-Salinas, A. et al. (2020). *Data re-uploading for a universal quantum classifier.* Quantum 4, 226.
- Mitarai, K. et al. (2018) and Schuld, M. et al. (2019). Parameter-shift rule for gradients on quantum hardware. Phys. Rev. A 98, 032309 / 99, 032331.
- scikit-learn documentation — https://scikit-learn.org/
