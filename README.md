# Google News Monitor - Alerts, Topics & Reports

Turn public Google News RSS feeds into a repeatable keyword and topic watchlist. The Actor returns the complete current article snapshot, labels repeat-run rows as baseline, new, updated, unchanged, or partial, and creates ready-to-review Markdown and formula-safe CSV reports.

This Actor uses the Google News RSS surface, not an official Google API. Feed availability, ranking, fields, and usage terms can change.

## What makes this useful

- **Named private watchlists:** reuse the same `monitorName` on a schedule to compare observations.
- **Honest change states:** distinguish the first baseline from genuinely new articles, changed RSS evidence, unchanged rows, and unavailable history.
- **Freshness signals:** configurable fresh and breaking-news time windows based only on publication timestamps. These are deterministic timing signals, not editorial judgments.
- **Source intelligence:** count unique publishers, show the largest publisher share, and flag concentrated five-or-more-row samples.
- **Story fingerprints:** group matching same-day headline word sets without AI, article-body scraping, or invented similarity claims.
- **Bounded history:** retain only the configured number of private observations per article.
- **Reports included:** `MONITOR_SUMMARY`, `MONITOR_REPORT.md`, and formula-safe `MONITOR_REPORT.csv` accompany the dataset.
- **Low-cost runtime:** direct RSS requests, 256 MB default memory, no browser, login, API key, or proxy by default.

The current price remains **$0.80 per 1,000 saved articles**, below many general Google News Store alternatives. The product competes on monitoring evidence and reports rather than claiming the lowest Store price.

## Quick start

```json
{
  "queries": ["artificial intelligence"],
  "topics": [],
  "topHeadlines": false,
  "country": "US",
  "language": "en",
  "maxArticlesPerFeed": 25,
  "trackChanges": true,
  "monitorName": "artificial-intelligence-us",
  "observationHistoryLimit": 10,
  "newArticleWindowHours": 24,
  "breakingWindowHours": 6,
  "proxyConfiguration": {
    "useApifyProxy": false
  }
}
```

Run the same input again—manually or through an Apify schedule—to advance observation counts and distinguish new, updated, and unchanged articles.

The Store prefill requests only one article so a first test stays quick and inexpensive. Raise `maxArticlesPerFeed` after checking that the feed and permitted use fit your workflow.

## Input

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `queries` | string array | `["artificial intelligence"]` | Up to 20 keyword or phrase searches. Google News search operators can be included in the query text. |
| `topics` | string array | `[]` | Up to eight values: `WORLD`, `NATION`, `BUSINESS`, `TECHNOLOGY`, `ENTERTAINMENT`, `SPORTS`, `SCIENCE`, or `HEALTH`. |
| `topHeadlines` | boolean | `false` | Also request the selected edition's main feed. |
| `country` | string | `US` | Two-letter edition code such as `US`, `GB`, or `IN`. |
| `language` | string | `en` | Two-letter language code such as `en`, `es`, or `hi`. |
| `maxArticlesPerFeed` | integer | `1` | From 1 to 100 validated records per selected feed. |
| `trackChanges` | boolean | `true` | Enable the named private watchlist and monitoring fields. |
| `monitorName` | string | `artificial-intelligence-us` | Stable 2-80 character watchlist name. Use different names for unrelated searches. |
| `observationHistoryLimit` | integer | `10` | Keep 1-50 private observations per article. |
| `newArticleWindowHours` | integer | `24` | Label articles inside this publication-age window as fresh. |
| `breakingWindowHours` | integer | `6` | High-severity timing signal for newly observed articles; cannot exceed the fresh window. |
| `proxyConfiguration` | object | disabled | Direct RSS requests normally work. Explicit Apify/custom HTTP(S) proxy settings remain supported. |

At least one query or topic is required unless `topHeadlines` is enabled. Malformed, unsupported, or unbounded inputs fail before any feed request.

## Output

Each dataset row contains validated RSS evidence plus monitoring intelligence:

| Group | Fields |
| --- | --- |
| Article | `title`, `source`, `sourceUrl`, `publisherDomain`, `link`, `guid`, `publishedAt`, `snippet` |
| Feed context | `feedType`, `feedQuery`, `country`, `language`, `scrapedAt` |
| Monitoring | `monitorName`, `monitoringStatus`, `changeSeverity`, `changeSummary`, `changedFields`, `changeSignals`, `previousSeenAt`, `observationCount` |
| Freshness | `ageHours`, `freshnessBucket` |
| Grouping | `storyClusterId` |
| Previous evidence | `previousTitle`, `previousSource`, `previousPublishedAt` |

Google News commonly repeats the headline and publisher in the RSS description. In that case `snippet` is returned as `null` rather than pretending it is an article summary.

## Monitoring behavior

- The first complete run for a watchlist produces `baseline` rows.
- A later unseen article is `new`.
- Changed RSS evidence is `updated` with exact `changedFields` and signals.
- A known article with identical evidence is `unchanged`.
- An article is `partial` when prior state cannot be read; the current paid row is still preserved.
- A failed or spending-limited scan does not advance the watchlist's completed-run marker, preventing incomplete scans from creating false “new” claims next time.
- Monitoring state is queued only after the current dataset row is saved.

History and reports live in Actor storage. Do not share storage links if your watchlist names or research topics are confidential.

## Reports and diagnostics

Every run writes:

- `RUN_STATUS` — source requests, feed outcomes, saved rows, duplicates, invalid items, and monitoring storage failures.
- `MONITOR_SUMMARY` — state counts, freshness, unique sources, publisher concentration, story fingerprints, and signal counts.
- `MONITOR_REPORT.md` — a readable overview with top sources and alert links.
- `MONITOR_REPORT.csv` — spreadsheet-ready output with formula-injection protection.

A valid empty feed finishes as `empty`. If every selected feed is blocked, malformed, or unavailable, the run fails visibly instead of returning a misleading zero-result success. Mixed source outcomes finish as `partial` while preserving successful rows.

## Pricing

| Event | Price |
| --- | ---: |
| `article-scraped` | `$0.0008` per validated, saved article |
| `apify-actor-start` | `$0.00005` per GB at run start |

That is **$0.80 per 1,000 saved articles**, plus platform usage. Records are validated and deduplicated before the atomic dataset write and charge. Failed, invalid, duplicate, or unsaved rows are not article events.

## Reliability and scope

- Structured XML parsing—no regex-based feed parsing.
- Bounded request deadlines, retries, response size, feed count, result count, and history.
- Only valid HTTPS Google News article links are emitted.
- Proxy credentials and access tokens are redacted from errors.
- No login, browser automation, article-body extraction, paywall bypass, author inference, sentiment claim, or personal-profile collection.
- Story IDs are deterministic headline fingerprints, not semantic or factual-equivalence judgments.

## Usage terms

At the time of the earlier reliability audit, the Google News RSS response included a notice limiting the feed to personal feed-reader use and prohibiting other uses. Verify current Google terms and obtain any required permission before running or redistributing results. For commercial monitoring, use a licensed news-data provider or publisher feeds whose terms explicitly permit that workflow.

Respect Google and publisher terms, copyright, robots.txt, privacy law, and downstream redistribution restrictions. This Actor is not affiliated with or endorsed by Google.

## License

Apache-2.0
