# Google News Scraper - Articles by Keyword & Topic

Read structured metadata from Google News RSS search, topic, and top-headline feeds. The Actor returns validated article titles, publishers, publisher URLs, Google News links, publication times, feed context, locale, and scrape timestamps.

This Actor uses the Google News RSS surface, not an official Google API. Feed availability, ranking, fields, and usage terms can change.

## Quick Start

```json
{
  "queries": ["artificial intelligence"],
  "topics": [],
  "topHeadlines": false,
  "country": "US",
  "language": "en",
  "maxArticlesPerFeed": 1,
  "proxyConfiguration": {
    "useApifyProxy": false
  }
}
```

The one-result default keeps the first test quick and inexpensive. Add feeds or raise the per-feed limit only after confirming the output fits your permitted use.

## Input

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `queries` | string array | `["artificial intelligence"]` | Up to 20 keyword or phrase searches, 256 characters each. Duplicate values are removed. |
| `topics` | string array | `[]` | Up to eight unique values: `WORLD`, `NATION`, `BUSINESS`, `TECHNOLOGY`, `ENTERTAINMENT`, `SPORTS`, `SCIENCE`, or `HEALTH`. |
| `topHeadlines` | boolean | `false` | Also request the main edition feed. |
| `country` | string | `US` | Two-letter edition code such as `US`, `GB`, or `IN`. |
| `language` | string | `en` | Two-letter language code such as `en`, `es`, or `hi`. |
| `maxArticlesPerFeed` | integer | `1` | From 1 to 100 validated records per feed. |
| `proxyConfiguration` | object | disabled | Direct requests are normally enough. Apify Proxy or custom HTTP(S) proxy URLs are accepted when explicitly configured. |

At least one query or topic is required unless `topHeadlines` is enabled. Malformed, unsupported, or unbounded inputs fail before any feed request.

## Output

Each dataset row is one validated Google News RSS item:

| Field | Description |
| --- | --- |
| `title` | Headline with the trailing ` - Publisher` suffix removed when present. |
| `source` | Publisher name supplied by the feed. |
| `sourceUrl` | Publisher homepage URL supplied by the RSS `<source>` element, when valid. |
| `link` | Google News article redirect URL. |
| `guid` | Google News RSS item identifier. |
| `publishedAt` | Valid ISO publication timestamp, otherwise `null`. |
| `snippet` | Distinct RSS description text when available. Google commonly repeats only the headline and publisher; that duplicate is returned as `null`. |
| `feedType` | `search`, `topic`, or `top`. |
| `feedQuery` | Keyword, topic, or top-headlines label. |
| `country`, `language` | Edition used for the feed. |
| `scrapedAt` | ISO timestamp for collection. |

## Verified Current Record

A direct one-feed verification on 2026-07-15 parsed 100 current RSS items with zero invalid rows. With a one-record limit, the first row was:

```json
{
  "title": "How do young people feel about AI? 7 teens weigh in",
  "source": "NPR",
  "sourceUrl": "https://www.npr.org/",
  "publishedAt": "2026-07-14T20:00:00.000Z",
  "snippet": null,
  "feedType": "search",
  "feedQuery": "artificial intelligence",
  "country": "US",
  "language": "en"
}
```

## Run Diagnostics

Every run writes `RUN_STATUS` to the default key-value store. It reports:

- final outcome: `succeeded`, `partial`, `empty`, `stopped_spending_limit`, or `failed`
- feeds requested, completed, empty, failed, and skipped
- request attempts, parsed and saved records, duplicates, and invalid items
- a bounded per-feed diagnostic without proxy credentials

A valid feed with no items finishes as `empty`. If every selected feed is blocked, malformed, or unavailable, the Actor fails visibly instead of returning a misleading zero-result success. Mixed outcomes finish as `partial` with the successful rows preserved.

## Pricing

Active pay-per-event pricing remains:

| Event | Price |
| --- | ---: |
| `article-scraped` | `$0.001` per validated article |
| `apify-actor-start` | `$0.00005` per GB at run start |

Records are validated and deduplicated before the atomic dataset write and charge. The Actor stops before requesting another feed after the user's spending limit is reached.

## Reliability Notes

- RSS is parsed with a structured XML parser rather than regular expressions.
- Requests use a 20-second deadline, bounded retries, compressed responses, and proxy-agent cleanup.
- HTTP 403, 408, 429, and temporary server failures are retried with bounded delay.
- Only valid `news.google.com` article links are emitted.
- Google News redirect URLs are not resolved to publisher article bodies.
- No login, browser automation, article-body extraction, or paywall bypass is performed.

## Usage Terms

At the time of the 2026-07-15 audit, the Google News RSS response included a notice limiting the feed to personal feed-reader use and prohibiting other uses. Verify the current Google terms and obtain any required permission before running or redistributing results. For commercial monitoring, use a licensed news-data provider or publisher feeds whose terms explicitly permit that workflow.

## Responsible Use

Use only metadata you are permitted to access and process. Respect Google and publisher terms, copyright, robots.txt, privacy law, and downstream redistribution restrictions. This Actor is not affiliated with or endorsed by Google.

## License

Apache-2.0
