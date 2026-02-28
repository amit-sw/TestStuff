import streamlit as st

if not st.user or not st.user.is_logged_in:
    if st.button("Log in"):
        st.login()
    st.write("User not logged in")
else:
    if st.button("Log out"):
        st.logout()
    st.write(f"Hello, {st.user.name}!")
