import json
import csv
import glob

rows = []

for file in glob.glob("gitinspector_*.json"):
    month = file.replace("gitinspector_", "").replace(".json","")

    with open(file) as f:
        data = json.load(f)

    for author in data["authors"]:
        rows.append({
            "month": month,
            "author": author["name"],
            "commits": author["commits"],
            "added": author["lines_added"],
            "deleted": author["lines_removed"],
            "files": author["files"]
        })

with open("git_metrics.csv","w",newline="") as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
