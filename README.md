# Google News Scraper - Articles by Keyword & Topic

Scrape **Google News** articles by search keyword, topic section, or top headlines - no login, no API key required. Extract titles, sources, links, publish dates, and snippets across any country and language edition. Export to **JSON, CSV, Excel, or HTML**, or pull via the Apify API.

Perfect for **media monitoring, brand tracking, sentiment analysis, and news aggregation**.

## Features

- ✅ **No login or API key** - uses Google News public RSS feeds
- ✅ **Three modes** - keyword search, topic sections, top headlines
- ✅ **Any edition** - set country and language
- ✅ **Clean output** - title (source stripped), source, link, publish date, snippet
- ✅ **Fast & lightweight** - pure RSS, no headless browser

## Input

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `queries` | `string[]` | Search keywords/phrases | `["artificial intelligence"]` |
| `topics` | `string[]` | Sections: `WORLD`, `NATION`, `BUSINESS`, `TECHNOLOGY`, `ENTERTAINMENT`, `SPORTS`, `SCIENCE`, `HEALTH` | `[]` |
| `topHeadlines` | `boolean` | Also fetch the main top-headlines feed | `false` |
| `country` | `string` | Country code (`US`, `GB`, `IN`, ...) | `US` |
| `language` | `string` | Language code (`en`, `es`, `hi`, ...) | `en` |
| `maxArticlesPerFeed` | `integer` | Max articles per feed (up to ~100) | `100` |
| `proxyConfiguration` | `object` | Proxy settings | Apify Proxy |

### Example input

```json
{
  "queries": ["Tesla earnings", "OpenAI"],
  "topics": ["TECHNOLOGY", "BUSINESS"],
  "topHeadlines": true,
  "country": "US",
  "language": "en",
  "maxArticlesPerFeed": 100
}
```

## Sample output

```json
{
  "title": "Apple's new Siri AI knows when to shut up",
  "source": "The Verge",
  "link": "https://news.google.com/rss/articles/CBMiek...",
  "guid": "CBMiek...",
  "publishedAt": "2026-06-10T22:52:17.000Z",
  "snippet": "Apple's new Siri AI knows when to shut up ...",
  "feedType": "topic",
  "feedQuery": "TECHNOLOGY",
  "country": "US",
  "language": "en",
  "scrapedAt": "2026-06-11T10:00:00.000Z"
}
```

## How to Scrape Google News (Step by Step)

1. Click **Try for free** / **Run**.
2. Add search keywords, topic sections (e.g. `TECHNOLOGY`), or enable top headlines.
3. Set `country`/`language` to target a specific Google News edition.
4. Set `maxArticlesPerFeed` (start small to test).
5. Run, then export results as JSON, CSV, Excel, or HTML, or pull them via the Apify API.

## Pricing

This Actor uses **pay-per-result** pricing:

| Event | Price |
|-------|-------|
| Per article scraped | **$0.001** ($1 / 1,000 articles) |

You are only charged for articles actually returned. Apify platform usage is billed separately by Apify.

## Use cases

- **Media monitoring** - track coverage of your brand, product, or competitors
- **Sentiment analysis** - feed headlines/snippets into NLP pipelines
- **News aggregation** - build topic- or keyword-based feeds
- **Trend tracking** - monitor stories across countries and languages

## Tips

- Combine `queries`, `topics`, and `topHeadlines` in one run for broad coverage.
- Use `country`/`language` to target specific Google News editions.
- Article links are Google News redirect URLs; the `source` field gives the publisher.

## License

Apache-2.0
