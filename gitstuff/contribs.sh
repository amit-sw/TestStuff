#!/bin/bash

echo "month,user,checkins,lines_added,lines_deleted"

git log --date=format:'%Y-%m' \
--pretty='%ad|%an' --numstat |
awk -F'|' '
NF==2 {
  month=$1; author=$2; commits[month,author]++
}
NF==3 {
  added[month,author]+=$1;
  deleted[month,author]+=$2;
}
END {
  for (k in commits) {
    split(k, arr, SUBSEP);
    printf "%s,%s,%d,%d,%d\n",
      arr[1], arr[2], commits[k], added[k], deleted[k];
  }
}'
