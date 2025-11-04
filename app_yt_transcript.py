
from youtube_transcript_api import YouTubeTranscriptApi

r=' '.join([i.text for i in YouTubeTranscriptApi().fetch('T2OHjHPkUzM')])
print(r[:100])

