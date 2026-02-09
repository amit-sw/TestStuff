import numpy as np
import streamlit as st
import matplotlib.pyplot as plt

from sklearn.datasets import make_blobs
from sklearn.model_selection import train_test_split
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import accuracy_score

st.set_page_config(layout="wide")



# -----------------------
# User controls
# -----------------------
st.sidebar.title("LR Visualization")
std = st.sidebar.slider(
    "Std Deviation",
    min_value=0.5,
    max_value=8.0,
    value=4.0,
    step=0.5
)

n_points = st.sidebar.slider(
    "Total number of points",
    min_value=50,
    max_value=1000,
    value=200,
    step=50
)

epochs = st.sidebar.slider(
    "Epoch count",
    min_value=1,
    max_value=200,
    value=30,
    step=1
)

if "training" not in st.session_state:
    st.session_state.training = False

if "epoch" not in st.session_state:
    st.session_state.epoch = 0
if "model" not in st.session_state:
    st.session_state.model = None

def start_training():
    st.session_state.training = True
    st.session_state.epoch = 0
    st.session_state.model = None

st.sidebar.button("Start Training", on_click=start_training)

# -----------------------
# Data generation
# -----------------------
X, y = make_blobs(
    n_samples=n_points,
    centers=2,
    cluster_std=std,
    random_state=10
)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# -----------------------
# Step 1: show data only
# -----------------------

plot_area = st.empty()

if not st.session_state.training:
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.scatter(X_train[:, 0], X_train[:, 1], c=y_train, cmap="RdBu", edgecolors="k", label="Train")
    ax.scatter(X_test[:, 0], X_test[:, 1], c=y_test, cmap="RdBu", marker="x", label="Test")
    ax.set_title(f"Cluster STD = {std} (before training)")
    ax.legend()
    plot_area.pyplot(fig, width="content")
    plt.close(fig)

# -----------------------
# Step 2: training animation
# -----------------------
if st.session_state.training:

    classes = np.unique(y_train)

    x_min, x_max = X[:, 0].min() - 1, X[:, 0].max() + 1
    y_min, y_max = X[:, 1].min() - 1, X[:, 1].max() + 1
    xx, yy = np.meshgrid(
        np.linspace(x_min, x_max, 200),
        np.linspace(y_min, y_max, 200)
    )

    if st.session_state.model is None:
        model = SGDClassifier(
            loss="log_loss",
            learning_rate="optimal",
            alpha=0.0005,
            random_state=0
        )
        model.partial_fit(X_train, y_train, classes=classes)
        st.session_state.model = model
    else:
        st.session_state.model.partial_fit(X_train, y_train)

    st.session_state.epoch += 1

    y_pred = st.session_state.model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)

    correct = y_pred == y_test
    incorrect = ~correct

    Z = st.session_state.model.predict(np.c_[xx.ravel(), yy.ravel()]).reshape(xx.shape)

    # ---- boundary plot ----
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.contourf(xx, yy, Z, alpha=0.25, cmap="RdBu")

    ax.scatter(
        X_train[:, 0], X_train[:, 1],
        c=y_train, cmap="RdBu",
        edgecolors="k", alpha=0.6, label="Train"
    )

    ax.scatter(
        X_test[correct, 0], X_test[correct, 1],
        c=y_test[correct], cmap="RdBu",
        edgecolors="black", s=70, label="Test correct"
    )

    ax.scatter(
        X_test[incorrect, 0], X_test[incorrect, 1],
        c=y_test[incorrect], cmap="RdBu",
        marker="X", edgecolors="black",
        s=140, label="Test incorrect"
    )

    ax.set_title(f"Epoch {st.session_state.epoch}/{epochs} | Accuracy: {acc*100:.1f}%")
    ax.legend()
    plot_area.pyplot(fig,width="content")
    plt.close(fig)

    if st.session_state.epoch >= epochs:
        st.session_state.training = False

    if st.session_state.training:
        st.rerun()
