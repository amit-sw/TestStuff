import io
from typing import List, Optional

import streamlit as st
from supabase import Client, create_client

BUCKET_NAME = st.secrets.get("SUPABASE_BUCKET", "logos")
TABLE_NAME = st.secrets.get("SUPABASE_TABLE", "account_logos")
SUPPORTED_TYPES = ["png", "jpg", "jpeg", "gif"]

def upload_file(client: Client, uploaded_file, account_id: str) -> Optional[str]:
    file_name = uploaded_file.name
    storage_path = f"{account_id}/{file_name}"
    file_bytes = uploaded_file.getvalue()
    try:
        client.storage.from_(BUCKET_NAME).upload(path=storage_path,file=file_bytes)
        return storage_path
    except Exception as exc:
        st.error(f"Upload failed: {exc}")
        return None

def download_file(client: Client, storage_path: str) -> Optional[io.BytesIO]:
    try:
        data = client.storage.from_(BUCKET_NAME).download(storage_path)
        return io.BytesIO(data)
    except Exception as exc:
        st.error(f"Download failed: {exc}")
        return None

def record_logo_entry(client: Client, account_id: str, file_name: str, storage_path: str) -> bool:
    payload = {
        "account_id": account_id,
        "file_name": file_name,
        "storage_path": storage_path,
    }
    try:
        response = client.table(TABLE_NAME).insert(payload).execute()
    except Exception as exc:
        st.error(f"Storing logo metadata failed: {exc}")
        return False
    return True

def fetch_accounts(client: Client) -> List[str]:
    try:
        response = client.table(TABLE_NAME).select("account_id").execute()
        data = getattr(response, "data", None) or []
        accounts = {item.get("account_id") for item in data if item.get("account_id")}
        return sorted(accounts)
    except Exception as exc:
        st.error(f"Could not load accounts: {exc}")
        return []

def fetch_logos_for_account(client: Client, account_id: str):
    try:
        response = (client.table(TABLE_NAME).select("*").eq("account_id", account_id).execute())
        return getattr(response, "data", None) or []
    except Exception as exc:
        st.error(f"Could not load logos: {exc}")
        return []

def render_logo_gallery(client: Client, logos) -> None:
    for logo in logos:
        file_name = logo.get("file_name") or "(unnamed)"
        storage_path = logo.get("storage_path")
        buffer = download_file(client, storage_path) if storage_path else None
        if buffer is not None:
            buffer.seek(0)
            st.image(buffer, caption=f"{file_name}\n{storage_path}")
        else:
            st.write(f"{file_name} ({storage_path}) – unable to display")

def main() -> None:
    st.title("Logo Manager")
    client = create_client(st.secrets["SUPABASE_URL"], st.secrets["SUPABASE_KEY"])
    st.subheader("Upload a logo")
    with st.form("upload_form", clear_on_submit=True):
        account_id = st.text_input("Account ID", placeholder="e.g. acct_123")
        uploaded_file = st.file_uploader("Choose an image", type=SUPPORTED_TYPES, accept_multiple_files=False)
        if account_id and upload_file:
            submitted = st.form_submit_button("Upload", type="primary")
            if submitted:
                storage_path = upload_file(client, uploaded_file, account_id)
                if storage_path:
                    stored = record_logo_entry(client,account_id,uploaded_file.name,storage_path)
                    if stored:
                        st.success(f"Stored logo '{uploaded_file.name}' for account '{account_id}'.")
    st.divider()

    st.subheader("Accounts")
    accounts = fetch_accounts(client)
    selected_account = st.selectbox("Pick an account", accounts)
    if selected_account:
        logos = fetch_logos_for_account(client, selected_account)
        st.subheader(f"Logos for {selected_account}")
        render_logo_gallery(client, logos)

if __name__ == "__main__":
    main()
