Logistic Regression Training Visualization — User Interaction Specification

Objective

Provide an interactive visual tool that allows users to understand how a binary classifier learns over time by observing the dataset, decision boundary evolution, and prediction correctness across training iterations.

⸻

Layout

Sidebar (Control Panel)

The sidebar contains all configuration controls and remains visible throughout the session.

Title:
LR Visualization

⸻

Controls (Top → Bottom order)

1. Std Deviation

Adjusts how much the two clusters overlap.
	•	Lower values → cleaner separation
	•	Higher values → more classification difficulty

Type: Slider
Range: Small overlap → heavy overlap

⸻

2. Total Number of Points

Controls dataset size.
	•	Fewer points → faster visual updates
	•	More points → denser dataset, more realistic learning

Type: Slider

⸻

3. Epoch Count

Defines how long training will run.
	•	Smaller value → quick demonstration
	•	Larger value → clearer view of convergence

Type: Slider

⸻

4. Start Training

Begins the learning process.

Behavior:

When pressed:
	1.	Dataset is generated using current settings.
	2.	The initial scatter plot is displayed.
	3.	Training begins automatically.
	4.	The visualization updates continuously until the selected epoch count is reached.

Important Interaction Rule:
This button represents a one-direction flow:

Idle → Training → Complete

No pause or stop control is required.

⸻

Main Display (Single Persistent Chart)

There is only one chart area that updates in place.
The display never switches between multiple plots.

This avoids cognitive interruption and makes the learning process easier to follow.

⸻

Visualization Phases

Phase 1 — Dataset Preview (Before Training)

Shown immediately after settings are adjusted.

Displays:
	•	Training points
	•	Testing points
	•	Visible cluster overlap

Purpose:
Help users visually predict whether the classifier will succeed.

Suggested title:

Cluster STD = X (before training)


⸻

Phase 2 — Training Progress

Once training starts, the same chart updates repeatedly.

Each update shows:

Decision Boundary
The model’s current separation between classes.

Training Points
Displayed but visually deemphasized.

Test Points
Clearly distinguished as:
	•	Correct predictions
	•	Incorrect predictions

Misclassifications should be visually obvious.

⸻

Dynamic Title

Each update should communicate learning progress:

Epoch A / B | Accuracy: XX.X%

This provides immediate feedback without requiring a secondary chart.

⸻

Animation Behavior

Training should appear continuous and progressive rather than instantaneous.

Users should observe:
	•	Early unstable boundary
	•	Rapid correction
	•	Gradual refinement
	•	Stabilization

The visual must update frequently enough that learning is perceptible.

⸻

Completion State

When the final epoch is reached:
	•	Training stops automatically
	•	The final boundary remains visible
	•	Accuracy reflects the completed model

The interface returns to an idle state, allowing parameter adjustment and another run.

⸻

Interaction Principles

1. Single Canvas

Avoid switching views. Update the existing visualization.

⸻

2. Deterministic Controls

Starting training always produces visible progress.

No intermittent states.

⸻

3. Immediate Cause-and-Effect

Changing a parameter should clearly influence:
	•	Cluster shape
	•	Difficulty
	•	Error rate
	•	Boundary behavior

⸻

4. Cognitive Clarity

Prefer visual simplicity over feature density.

Do NOT include:
	•	Multiple charts
	•	Confusion matrices
	•	Secondary metrics panels

The goal is intuition, not analytical depth.

⸻

5. Teaching-Oriented Design

Users should be able to infer:
	•	Why overlap matters
	•	How classifiers adapt
	•	Why errors persist
	•	What convergence looks like

Without explanation.

⸻

Ideal User Flow
	1.	Adjust Std Deviation.
	2.	Adjust number of points.
	3.	Choose training duration.
	4.	Press Start Training.
	5.	Watch the boundary learn.
	6.	Observe final performance.
	7.	Modify parameters and repeat.

⸻

Future Extensions (Optional)

Potential enhancements that build on the core experience:
	•	Step-by-step epoch control
	•	Learning-rate influence
	•	Noise injection
	•	Class imbalance visualization

These are extensions rather than requirements for the primary visualization.