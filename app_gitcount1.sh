#!/bin/bash

YEAR=2025

for MONTH in {01..12}
do
  START="$YEAR-$MONTH-01"

  # GNU date (Linux). On macOS install coreutils and use gdate.
  END=$(date -d "$START +1 month" +%Y-%m-%d)

  OUTFILE="/tmp/gitinspector_${YEAR}_${MONTH}.json"

  gitinspector \
    --since="$START" \
    --until="$END" \
    --format=json \
    > "$OUTFILE"

  echo "Generated $OUTFILE"
done
