# 4. The quantum circuit, explained (viva notes)

Code: `qml/src/quantum_model.py`. Everything below maps to a few lines there.

## 4.1 What a qubit is

A classical bit is 0 or 1. A **qubit** is described by two complex numbers (amplitudes) α, β with |α|² + |β|² = 1:

  |ψ⟩ = α|0⟩ + β|1⟩

Measuring it gives 0 with probability |α|² and 1 with probability |β|². With **n qubits** the state needs 2ⁿ amplitudes (one per bit-string 0000 … 1111). We use **4 qubits → 16 amplitudes**. That is why a classical computer can simulate this exactly: 16 numbers per sample is nothing. (At ~50 qubits, 2⁵⁰ numbers no longer fit in any computer — that is where quantum hardware would be needed.)

In the code a batch of states is a NumPy array of shape `(batch, 2, 2, 2, 2)`: axis *q+1* is qubit *q*.

## 4.2 The gates we use

| Gate | Matrix | What it does |
|---|---|---|
| **RY(θ)** | [[cos θ/2, −sin θ/2], [sin θ/2, cos θ/2]] | rotates the qubit between |0⟩ and |1⟩; changes the measurement probabilities |
| **RZ(θ)** | diag(e^(−iθ/2), e^(iθ/2)) | rotates the *phase*; invisible on its own, but changes what later gates do |
| **CNOT(c → t)** | flips qubit *t* when qubit *c* is 1 | creates **entanglement** — the qubits stop being independent, so the output can depend on combinations of features |

Same definitions as PennyLane (`qml.RY`, `qml.RZ`, `qml.CNOT`). `--check-pennylane` confirms both give identical numbers; `--self-test` checks our simulator against full 16×16 matrices built from Kronecker products.

## 4.3 How classical data is put into the circuit (encoding)

Each road patch → 16 features → PCA to 8 numbers → each scaled to an angle in [0, π] (fit on training data only).

**Dense angle encoding:** qubit *q* receives two features as rotation angles:

  RY(x₂q) then RZ(x₂q+1)  — so 8 features fit on 4 qubits.

Angles must lie in a fixed range because rotations are periodic (θ and θ + 2π are the same gate); [0, π] keeps different feature values distinguishable.

**Data re-uploading:** the encoding is repeated at the start of every layer. A single encoding only lets the model represent simple (trigonometric degree-1) functions of each feature; re-uploading L times raises the expressiveness, like adding hidden units to a neural network (Pérez-Salinas et al., 2020).

## 4.4 The variational ("trainable") circuit

One **layer** = encode → trainable rotations → entangle:

```
q0: ─RY(x0)─RZ(x1)─RY(θ00)─RZ(θ01)─●──────────X─   ┐
q1: ─RY(x2)─RZ(x3)─RY(θ10)─RZ(θ11)─X──●───────┼─   │ repeated L times
q2: ─RY(x4)─RZ(x5)─RY(θ20)─RZ(θ21)────X──●────┼─   │ (L = number of layers)
q3: ─RY(x6)─RZ(x7)─RY(θ30)─RZ(θ31)───────X────●─   ┘
                                                     then measure ⟨Z⟩ on q0, q1, q2
```

- The **θ angles are the model's weights**: 2 per qubit per layer → 8·L quantum parameters (32 for 4 layers).
- The CNOT **ring** (0→1→2→3→0) entangles all qubits every layer.
- The number of layers L and the learning rate were chosen on a validation split of the training data (see `results/graphs/quantum_vqc_selection.png`).

## 4.5 How predictions are generated

1. Run the circuit for the patch → final 16-amplitude state.
2. For qubits 0, 1, 2 compute the expectation value ⟨Z_k⟩ = P(qubit k = 0) − P(qubit k = 1), a number in [−1, 1]. One qubit per class: q0 = Cracks, q1 = Normal, q2 = Pothole (q3 is a helper qubit).
3. Classical post-processing (the "hybrid" part): logit_k = a_k·⟨Z_k⟩ + b_k with 3 trainable scales a and 3 biases b (a starts at 3 so logits are not squashed into [−1, 1]).
4. Softmax → class probabilities; prediction = largest probability.

On real hardware ⟨Z_k⟩ is estimated by running the circuit many times ("shots") and counting 0s and 1s. The simulator computes it exactly (infinite shots).

## 4.6 How the model learns

- **Loss:** cross-entropy between the softmax probabilities and the true class (same as a classical classifier).
- **Gradient of the quantum weights — parameter-shift rule:** for a rotation gate,

  ∂⟨Z⟩/∂θ = [⟨Z⟩(θ + π/2) − ⟨Z⟩(θ − π/2)] / 2

  This is *exact* (not an approximation) and only needs two extra runs of the same circuit, which is why it also works on real quantum computers where you cannot "backpropagate" through the hardware. With 32 parameters, one gradient = 64 circuit runs per mini-batch. `--self-test` checks it against finite differences.
- **Chain rule:** ∂L/∂θ = Σ_k (∂L/∂logit_k) · a_k · ∂⟨Z_k⟩/∂θ. The a, b gradients are ordinary calculus.
- **Optimiser:** Adam, mini-batches of 32, a few dozen epochs; the epoch with the best validation F1 was used to fix the epoch budget of the final run on all 900 training patches.

## 4.7 The QSVM (quantum kernel) in one minute

Same encoding (RY/RZ + CNOT ring, repeated twice), **no trainable gates**. For two patches the kernel is the fidelity

  K(x, x′) = |⟨φ(x′)|φ(x)⟩|²  (1 = identical states, 0 = orthogonal)

The 900×900 training kernel goes into scikit-learn's `SVC(kernel="precomputed")`; C is chosen by GroupKFold CV on the training set.

## 4.8 Likely viva questions

| Question | Short answer |
|---|---|
| Is this running on a quantum computer? | No. It is an exact classical simulation of a 4-qubit circuit (NumPy, cross-checked with PennyLane). The same circuit could be sent to IBM/PennyLane hardware backends; we did not do that. |
| Why only 4 qubits? | Our input is 8 features; 2 per qubit. More qubits would need more features or a different encoding, and simulation cost doubles per qubit. |
| Why PCA before the circuit? | 16 features cannot be encoded on 4 qubits with 2 angles each. PCA keeps the directions with the most variance. The classical models are also tested on the same 8 numbers so the comparison is fair. |
| What does entanglement add? | Without CNOTs each qubit would only see its own 2 features; ⟨Z₀⟩ could never depend on features from qubit 3. CNOTs let the class scores depend on feature combinations. |
| Why parameter shift and not backprop? | It is the method that works on hardware and gives exact gradients for rotation gates. In simulation backprop would be faster — PennyLane can do both. |
| Did QML beat classical ML? | No — see `05_results_and_discussion.md`. We make no quantum-advantage claim. |
| What would make it better? | More qubits/features, trainable encoding, better features (e.g. from Arnav's CNN), noise-aware runs on hardware. See section 5. |
