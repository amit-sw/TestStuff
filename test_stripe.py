# streamlit_app.py
import streamlit as st
import stripe

stripe.api_key = st.secrets["STRIPE_SECRET_KEY"]

# Keep the customer id across reruns
if "customer_id" not in st.session_state:
    st.session_state.customer_id = None

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
    return stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[
            {
                # Configure this in your Stripe dashboard, then place the price id in secrets as STRIPE_PRICE_ID
                "price": st.secrets["STRIPE_PRICE_ID"],
                "quantity": 1,
            }
        ],
        success_url=success_url,
        cancel_url=cancel_url,
    )


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

if st.session_state.customer_id:
    st.subheader("Subscribe to the monthly plan")
    if st.button("Start subscription"):
        try:
            checkout_session = create_subscription_checkout(st.session_state.customer_id)
            st.success("Checkout session created.")
            st.link_button("Open Stripe checkout", checkout_session.url)
        except Exception as exc:  # noqa: BLE001
            st.error(f"Could not start subscription: {exc}")
