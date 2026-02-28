import numpy as np
import matplotlib.pyplot as plt

from sklearn.datasets import make_blobs
from sklearn.model_selection import train_test_split
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, ConfusionMatrixDisplay

# -----------------------
# Data
# -----------------------
np.random.seed(0)
X, y = make_blobs(n_samples=200, centers=2, random_state=10, cluster_std=4.0)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# -----------------------
# Model
# -----------------------
model = SGDClassifier(
    loss="log_loss",
    penalty="l2",
    alpha=0.0005,
    learning_rate="optimal",
    random_state=0
)

classes = np.unique(y_train)

# grid for boundary
x_min, x_max = X[:, 0].min() - 1, X[:, 0].max() + 1
y_min, y_max = X[:, 1].min() - 1, X[:, 1].max() + 1
xx, yy = np.meshgrid(
    np.linspace(x_min, x_max, 200),
    np.linspace(y_min, y_max, 200),
)

plt.ion()
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

epochs = 40

for epoch in range(epochs):

    # incremental training
    if epoch == 0:
        model.partial_fit(X_train, y_train, classes=classes)
    else:
        model.partial_fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)

    correct = y_pred == y_test
    incorrect = ~correct

    Z = model.predict(np.c_[xx.ravel(), yy.ravel()]).reshape(xx.shape)

    ax1.clear()
    ax2.clear()

    # boundary
    ax1.contourf(xx, yy, Z, alpha=0.2, cmap="RdBu")

    # train
    ax1.scatter(
        X_train[:, 0], X_train[:, 1],
        c=y_train, cmap="RdBu",
        edgecolors="k", alpha=0.6,
        label="Train"
    )

    # correct
    ax1.scatter(
        X_test[correct, 0], X_test[correct, 1],
        c=y_test[correct], cmap="RdBu",
        edgecolors="black",
        s=70,
        label="Test correct"
    )

    # incorrect — use filled X (no warning)
    ax1.scatter(
        X_test[incorrect, 0], X_test[incorrect, 1],
        c=y_test[incorrect], cmap="RdBu",
        marker="X",
        edgecolors="black",
        s=140,
        label="Test incorrect"
    )

    ax1.set_xlim(x_min, x_max)
    ax1.set_ylim(y_min, y_max)
    ax1.set_title(f"Epoch {epoch+1}/{epochs}   Accuracy: {acc*100:.1f}%")
    ax1.legend()

    # confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    disp = ConfusionMatrixDisplay(cm)
    disp.plot(ax=ax2, cmap="Greys", colorbar=False)
    ax2.set_title("Confusion Matrix")

    fig.canvas.draw_idle()
    plt.pause(0.35)

plt.ioff()
plt.show()
