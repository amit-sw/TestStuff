# streamlit_app.py
import streamlit as st
import stripe

stripe.api_key = st.secrets["STRIPE_SECRET_KEY"]

# Keep the customer id across reruns
if "customer_id" not in st.session_state:
    st.session_state.customer_id = None
if "subscription_status" not in st.session_state:
    st.session_state.subscription_status = None

# ---- Your app's user system (simplified) ----
def get_current_user_id() -> str:
    # In real life, return the ID from your auth system / DB
    return "user_123"

def save_stripe_customer_id(user_id: str, customer_id: str):
    """
    CALLBACK: implement this to save the mapping in your DB.
    e.g., UPDATE users SET stripe_customer_id = ... WHERE id = ...
    For demo, we'll just print.
    """
    print(f"Save in DB: user {user_id} -> stripe_customer_id {customer_id}")


# ---- Stripe helpers ----
def create_or_get_customer(email: str, name: str, user_id: str):
    # Optional: check if you already created a customer for this email
    existing = stripe.Customer.list(email=email, limit=1)
    if existing.data:
        customer = existing.data[0]
    else:
        customer = stripe.Customer.create(
            email=email,
            name=name,
            metadata={"app_user_id": user_id},
        )
    # "Callback" to you: store mapping in your DB
    save_stripe_customer_id(user_id, customer.id)
    return customer


def create_subscription_checkout(customer_id: str):
    # URLs should be your deployed app. For local dev, default to localhost.
    success_url = st.secrets.get("STRIPE_SUCCESS_URL", "http://localhost:8501") + "?session_id={CHECKOUT_SESSION_ID}"
    cancel_url = st.secrets.get("STRIPE_CANCEL_URL", "http://localhost:8501")
    price_id = st.secrets["STRIPE_PRICE_ID"]
    if not price_id.startswith("price_"):
        raise ValueError("STRIPE_PRICE_ID should be a Stripe Price ID (e.g., 'price_...'), not a product id.")
    return stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[
            {
                # Configure this in your Stripe dashboard, then place the price id in secrets as STRIPE_PRICE_ID
                "price": price_id,
                "quantity": 1,
            }
        ],
        success_url=success_url,
        cancel_url=cancel_url,
    )


def check_returned_session():
    # Works on Streamlit >=1.37 (query_params); fallback otherwise.
    params = st.query_params if hasattr(st, "query_params") else st.experimental_get_query_params()
    session_id = params.get("session_id")
    if isinstance(session_id, list):
        session_id = session_id[0] if session_id else None
    if not session_id:
        return

    try:
        session = stripe.checkout.Session.retrieve(session_id, expand=["subscription"])
        if session.status == "complete" and session.payment_status in {"paid", "no_payment_required"}:
            st.session_state.subscription_status = f"Subscription active. ID: {session.subscription.id}"
        else:
            st.session_state.subscription_status = f"Checkout not complete (status={session.status}, payment={session.payment_status})."
    except Exception as exc:  # noqa: BLE001
        st.session_state.subscription_status = f"Could not verify checkout: {exc}"


# ---- Streamlit UI ----
st.title("Sign up")

with st.form("signup_form"):
    name = st.text_input("Full name")
    email = st.text_input("Email")
    submitted = st.form_submit_button("Sign up")

if submitted:
    if not name or not email:
        st.error("Please provide name and email.")
    else:
        user_id = get_current_user_id()
        customer = create_or_get_customer(email=email, name=name, user_id=user_id)
        st.session_state.customer_id = customer.id
        st.success(f"Welcome, {name}! Your Stripe customer ID is {customer.id}")

# If coming back from Stripe, verify and show status
check_returned_session()
if st.session_state.subscription_status:
    st.info(st.session_state.subscription_status)

if st.session_state.customer_id:
    st.subheader("Subscribe to the monthly plan")
    if st.button("Start subscription"):
        try:
            checkout_session = create_subscription_checkout(st.session_state.customer_id)
            st.success("Checkout session created.")
            st.link_button("Open Stripe checkout", checkout_session.url)
        except Exception as exc:  # noqa: BLE001
            st.error(f"Could not start subscription: {exc}")
