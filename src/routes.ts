import type { ArticleRecord } from './types.js';

function decodeEntities(s: string): string {
    return s
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&amp;/g, '&')
        .trim();
}

function tag(block: string, name: string): string | null {
    const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
    return m ? decodeEntities(m[1]) : null;
}

function stripHtml(s: string | null): string | null {
    if (!s) return null;
    const out = s
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
    return out || null;
}

/** Parse a Google News RSS XML feed into clean article records. */
export function parseFeed(
    xml: string,
    ctx: { feedType: string; feedQuery: string; country: string; language: string },
    limit: number,
): ArticleRecord[] {
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
    const records: ArticleRecord[] = [];
    for (const m of items) {
        if (records.length >= limit) break;
        const block = m[1];
        const rawTitle = tag(block, 'title');
        const source = tag(block, 'source');
        // Google News titles are "Headline - Source"; trim the trailing source.
        let title = rawTitle;
        if (title && source && title.endsWith(` - ${source}`)) {
            title = title.slice(0, -(` - ${source}`).length).trim();
        }
        records.push({
            title,
            source,
            link: tag(block, 'link'),
            guid: tag(block, 'guid'),
            publishedAt: toIso(tag(block, 'pubDate')),
            snippet: stripHtml(tag(block, 'description')),
            feedType: ctx.feedType,
            feedQuery: ctx.feedQuery,
            country: ctx.country,
            language: ctx.language,
            scrapedAt: new Date().toISOString(),
        });
    }
    return records;
}

function toIso(d: string | null): string | null {
    if (!d) return null;
    const t = Date.parse(d);
    return Number.isNaN(t) ? d : new Date(t).toISOString();
}
