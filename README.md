# Google News Scraper - Articles by Keyword & Topic

Scrape Google News RSS results by keyword, topic section, or top-headlines feed. The Actor returns clean article rows with title, publisher, Google News link, publish time, snippet, feed context, country, language, and scrape timestamp.

It is built for media monitoring, brand and competitor tracking, market research, and lightweight news dashboards. No login, browser, or API key is required.

## Quick Start

```json
{
  "queries": ["artificial intelligence"],
  "topics": [],
  "topHeadlines": false,
  "country": "US",
  "language": "en",
  "maxArticlesPerFeed": 5,
  "proxyConfiguration": {
    "useApifyProxy": false
  }
}
```

This small run keeps cost low and is a good first check before adding more keywords, topics, or top headlines.

## Input

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `queries` | string array | `["artificial intelligence"]` | Keyword or phrase searches. |
| `topics` | string array | `[]` | Google News topics such as `BUSINESS`, `TECHNOLOGY`, `WORLD`, `SCIENCE`, or `HEALTH`. |
| `topHeadlines` | boolean | `false` | Also fetch the main top-headlines feed. |
| `country` | string | `US` | Two-letter edition code such as `US`, `GB`, or `IN`. |
| `language` | string | `en` | Two-letter language code such as `en`, `es`, or `hi`. |
| `maxArticlesPerFeed` | integer | `10` | Maximum articles per query, topic, or top-headlines feed. |
| `proxyConfiguration` | object | disabled | Usually not needed for small RSS runs. Enable only for larger or repeated runs. |

## Output

Each dataset row is one unique Google News RSS item:

| Field | Description |
| --- | --- |
| `title` | Article headline with trailing publisher text removed when possible. |
| `source` | Publisher shown by Google News. |
| `link` | Google News article URL. |
| `guid` | Google News RSS item identifier. |
| `publishedAt` | Publication time as ISO date when available. |
| `snippet` | Short RSS description text. |
| `feedType` | `search`, `topic`, or `top`. |
| `feedQuery` | Keyword, topic, or top-headlines label. |
| `country`, `language` | Edition used for the feed. |
| `scrapedAt` | Actor scrape timestamp. |

## Verified Sample

An existing successful run for `artificial intelligence` returned this row:

```json
{
  "title": "Brands using AI-generated influencers to promote products on social media",
  "source": "The Guardian",
  "publishedAt": "2026-06-21T06:01:00.000Z",
  "snippet": "Brands using AI-generated influencers to promote products on social media The Guardian",
  "feedType": "search",
  "feedQuery": "artificial intelligence",
  "country": "US",
  "language": "en"
}
```

## Pricing

Active pay-per-event pricing:

| Event | Price |
| --- | ---: |
| `article-scraped` | `$0.001` per article |
| `apify-actor-start` | `$0.00005` per GB at run start |

Duplicate articles from overlapping feeds are skipped. Each article is saved and charged atomically, and the Actor stops before fetching another feed when the user's spending limit is reached.

## Common Workflows

1. Track brand or competitor news with one or more `queries`.
2. Monitor broad market movement with `topics` such as `BUSINESS` or `TECHNOLOGY`.
3. Schedule a daily run and export the dataset to CSV, Excel, JSON, or the Apify API.
4. Feed article rows into a dashboard, alerting workflow, or LLM summarization pipeline.

## Notes and Limits

- Results come from Google News RSS feeds, so coverage and ranking follow Google News.
- Article links are Google News redirect URLs; the `source` field identifies the publisher.
- Very broad runs can return overlapping articles; duplicates are skipped by `guid` or link.
- Small runs normally do not need a proxy.

## Responsible Use

Use this Actor for lawful collection of publicly available news metadata. Respect source terms, robots.txt, copyright, privacy laws, and any downstream restrictions for the content you export or process.

## License

Apache-2.0
