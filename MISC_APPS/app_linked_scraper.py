import streamlit as st
from apify_client import ApifyClient
import pandas as pd
import re
import time

# --- CONFIGURATION ---
APIFY_API_TOKEN = st.secrets["APIFY_API_TOKEN"]
client = ApifyClient(APIFY_API_TOKEN)

import streamlit as st
import pandas as pd
import time
import re
from apify_client import ApifyClient

# ===========================================
# CONFIG
# ===========================================
st.set_page_config(page_title="LinkedIn Post Scraper", page_icon="💼")
st.title("💼 LinkedIn Post Engagement Scraper")

st.markdown("""
Easily extract **comments, replies, and reactions** from any LinkedIn post  
using Apify’s LinkedIn scrapers — no cookies or login required.  
---
""")

post_url = st.text_input("🔗 Paste LinkedIn Post URL (e.g., https://www.linkedin.com/feed/update/urn:li:activity:1234567890123456789)")

# ===========================================
# HELPERS
# ===========================================

def extract_post_id(linkedin_url):
    """Extract numeric ID from LinkedIn URLs like activity-xxxx or activity:xxxx"""
    match = re.search(r"(?:activity-|activity:)(\d+)", linkedin_url)
    return match.group(1) if match else None

def get_reactions(client, post_url):
    """Fetch all reactions"""
    all_reactions = []
    page = 1
    while True:
        run = client.actor("apimaestro/linkedin-post-reactions").call(run_input={
            "post_url": post_url,
            "page_number": page,
            "reaction_type": "ALL",
            "limit": 100
        })
        items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
        if not items:
            break
        all_reactions.extend(items)
        st.write(f"✅ Reactions page {page}: {len(items)} items")
        if len(items) < 100:
            break
        page += 1
        time.sleep(2)
    return all_reactions

def get_comments(client, post_id):
    """Fetch all comments & replies"""
    all_comments = []
    page = 1
    while True:
        run = client.actor("apimaestro/linkedin-post-comments-replies-engagements-scraper-no-cookies").call(run_input={
            "postIds": [post_id],
            "page_number": page,
            "limit": 100
        })
        items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
        if not items:
            break
        all_comments.extend(items)
        st.write(f"✅ Comments page {page}: {len(items)} items")
        if len(items) < 100:
            break
        page += 1
        time.sleep(2)
    return all_comments

# ===========================================
# MAIN APP
# ===========================================
if st.button("🚀 Run Scraper"):
    if not APIFY_API_TOKEN:
        st.error("Please enter your Apify API token.")
    elif not post_url:
        st.error("Please provide a LinkedIn post URL.")
    else:
        client = ApifyClient(APIFY_API_TOKEN)
        post_id = extract_post_id(post_url)

        if not post_id:
            st.error("❌ Could not extract post ID. Please make sure your URL contains 'activity-<numbers>' or 'activity:<numbers>'.")
        else:
            st.info(f"Scraping data for post ID `{post_id}` … this may take a few minutes ⏳")

            # Fetch reactions
            with st.spinner("Fetching reactions..."):
                reactions = get_reactions(client, post_url)
            st.success(f"🎉 Retrieved {len(reactions)} reactions")

            # Fetch comments
            with st.spinner("Fetching comments..."):
                comments = get_comments(client, post_id)
            st.success(f"💬 Retrieved {len(comments)} comments")

            # Convert to DataFrames
            df_reactions = pd.DataFrame([
                {
                    "Type": "Reaction",
                    "Reaction Type": r.get("reaction_type"),
                    "Name": r.get("reactor", {}).get("name"),
                    "Headline": r.get("reactor", {}).get("headline"),
                    "Profile URL": r.get("reactor", {}).get("profile_url"),
                    "Comment": None
                }
                for r in reactions
            ])

            df_comments = pd.DataFrame([
                {
                    "Type": "Comment",
                    "Reaction Type": None,
                    "Name": c.get("commenter", {}).get("name"),
                    "Headline": c.get("commenter", {}).get("headline"),
                    "Profile URL": c.get("commenter", {}).get("profile_url"),
                    "Comment": c.get("comment_text"),
                }
                for c in comments
            ])

            combined_df = pd.concat([df_reactions, df_comments], ignore_index=True)

            st.subheader("📊 Combined Data Preview")
            st.dataframe(combined_df)

            st.download_button(
                label="📥 Download Combined CSV",
                data=combined_df.to_csv(index=False).encode("utf-8"),
                file_name=f"linkedin_post_data_{post_id}.csv",
                mime="text/csv"
            )

            st.success("✅ Done! You can download the combined data above.")

st.markdown("---")
st.caption("Built with ❤️ using Apify & Streamlit | @API Maestro + ChatGPT")

