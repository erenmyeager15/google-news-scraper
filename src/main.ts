import { Actor, log } from 'apify';
import { ProxyAgent } from 'undici';
import type { ActorInput } from './types.js';
import { parseFeed } from './routes.js';

await Actor.init();

const input = ((await Actor.getInput<ActorInput>()) ?? {}) as ActorInput;
const {
    queries = [],
    topics = [],
    topHeadlines = false,
    country = 'US',
    language = 'en',
    maxArticlesPerFeed = 100,
    proxyConfiguration: proxyInput,
} = input;

const gl = (country || 'US').toUpperCase();
const hl = (language || 'en').toLowerCase();
const ceid = `${gl}:${hl}`;
const qs = `hl=${hl}-${gl}&gl=${gl}&ceid=${encodeURIComponent(ceid)}`;

const q = queries.map((x) => x.trim()).filter(Boolean);
const tp = topics.map((x) => x.trim().toUpperCase()).filter(Boolean);

if (q.length === 0 && tp.length === 0 && !topHeadlines) {
    log.error('No input. Provide queries, topics, or enable topHeadlines.');
    await Actor.exit();
}

const proxyConfiguration = (proxyInput?.useApifyProxy || proxyInput?.proxyUrls?.length)
    ? await Actor.createProxyConfiguration(proxyInput)
    : undefined;

interface Feed { url: string; feedType: string; feedQuery: string; }
const feeds: Feed[] = [];
if (topHeadlines) feeds.push({ url: `https://news.google.com/rss?${qs}`, feedType: 'top', feedQuery: 'top headlines' });
for (const t of tp) feeds.push({ url: `https://news.google.com/rss/headlines/section/topic/${encodeURIComponent(t)}?${qs}`, feedType: 'topic', feedQuery: t });
for (const term of q) feeds.push({ url: `https://news.google.com/rss/search?q=${encodeURIComponent(term)}&${qs}`, feedType: 'search', feedQuery: term });

log.info(`Fetching ${feeds.length} Google News feed(s) | country=${gl} language=${hl}`);

async function fetchFeed(url: string): Promise<string | null> {
    for (let attempt = 0; attempt < 4; attempt++) {
        let dispatcher: ProxyAgent | undefined;
        if (proxyConfiguration) {
            const purl = await proxyConfiguration.newUrl();
            if (purl) dispatcher = new ProxyAgent(purl);
        }
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': `${hl}-${gl}` }, ...(dispatcher ? { dispatcher } : {}) } as any);
            if (res.ok) return await res.text();
            if (res.status === 429 || res.status === 403) {
                log.warning(`Blocked (${res.status}) on feed - attempt ${attempt + 1}`);
                if (!proxyConfiguration) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
                continue;
            }
            log.warning(`HTTP ${res.status} on ${url}`);
            return null;
        } catch (e) {
            log.warning(`Request error: ${(e as Error).message}`);
        }
    }
    return null;
}

let total = 0;
let spendingLimitReached = false;
const seenArticles = new Set<string>();

for (const feed of feeds) {
    if (spendingLimitReached) break;

    const xml = await fetchFeed(feed.url);
    if (!xml) {
        log.warning(`No data for ${feed.feedType} "${feed.feedQuery}".`);
        continue;
    }
    const records = parseFeed(xml, { feedType: feed.feedType, feedQuery: feed.feedQuery, country: gl, language: hl }, maxArticlesPerFeed);
    let savedFromFeed = 0;

    for (const record of records) {
        const articleKey = record.guid
            ?? record.link
            ?? `${record.title ?? ''}|${record.source ?? ''}|${record.publishedAt ?? ''}`;

        if (seenArticles.has(articleKey)) continue;

        const chargeResult = await Actor.pushData(record, 'article-scraped');
        const recordWasSaved = chargeResult.chargedCount > 0 || !chargeResult.eventChargeLimitReached;
        if (recordWasSaved) {
            seenArticles.add(articleKey);
            total += 1;
            savedFromFeed += 1;
        }

        if (chargeResult.eventChargeLimitReached) {
            spendingLimitReached = true;
            const message = `Stopped at the user's spending limit after ${total} article(s).`;
            await Actor.setStatusMessage(message);
            log.warning(message);
            break;
        }
    }

    log.info(`${feed.feedType} "${feed.feedQuery}": parsed ${records.length}, saved ${savedFromFeed} article(s)`);
}

if (!spendingLimitReached) {
    await Actor.setStatusMessage(`Finished with ${total} unique article(s).`);
    log.info(`Google News scrape finished. ${total} unique article(s) saved.`);
}
await Actor.exit();
