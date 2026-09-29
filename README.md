# marino-tracker

Records how busy Northeastern's Marino Center and SquashBusters are, every
15 minutes, into [`data/history.json`](data/history.json). The page at
[aedinlai.com/projects/marino-tracker](https://www.aedinlai.com) shows the live
count plus the last 7 days hour by hour, to find the quietest time to go.

- Source: the public facility-count feed behind
  [recreation.northeastern.edu/live-facility-counts](https://recreation.northeastern.edu/live-facility-counts/).
- `scripts/sample.mjs` takes one sample; `.github/workflows/sample.yml` runs it.
- Keeps 28 days. Counts older than 2 hours (closed rooms) are stored as `null`.
