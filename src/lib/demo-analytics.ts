/**
 * Seeded DEMO analytics. Everything here is synthetic and must always be
 * labelled as demo data in the UI.
 *
 * Only measurable signal types are modelled:
 *  - entity/product appearances inside Crawler
 *  - Crawler conversation + query counts
 *  - trackable outbound link clicks
 *  - UTM / referrer data
 *  - crawler / read events on the published presence
 *
 * Crawler never has access to private ChatGPT, Claude or Gemini conversations.
 */

export type DayRow = {
  date: string;
  conversations: number;
  queries: number;
  appearances: number;
  outboundClicks: number;
  crawlerReads: number;
};

export type TopicRow = { label: string; count: number; trend: number };

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function demoDays(count = 90): DayRow[] {
  const rand = seeded(20260811);
  const rows: DayRow[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    const weekend = [0, 6].includes(d.getUTCDay()) ? 0.65 : 1;
    const growth = 1 + (count - i) / (count * 1.6);
    const base = (8 + rand() * 10) * weekend * growth;
    const conversations = Math.round(base);
    const queries = Math.round(base * (1.8 + rand() * 0.9));
    rows.push({
      date: d.toISOString().slice(0, 10),
      conversations,
      queries,
      appearances: Math.round(queries * (1.1 + rand() * 0.5)),
      outboundClicks: Math.round(conversations * (0.25 + rand() * 0.2)),
      crawlerReads: Math.round(4 + rand() * 14 * growth),
    });
  }
  return rows;
}

export const demoTopics: TopicRow[] = [
  { label: "Gravel bike sizing and geometry", count: 184, trend: 22 },
  { label: "Delivery time and shipping countries", count: 141, trend: 9 },
  { label: "Price of Product X", count: 118, trend: -4 },
  { label: "Warranty and spare parts", count: 96, trend: 14 },
  { label: "Materials and where it is made", count: 74, trend: 6 },
  { label: "Custom / made-to-order options", count: 51, trend: 31 },
];

export const demoEntities: TopicRow[] = [
  { label: "Product X", count: 212, trend: 12 },
  { label: "Gravel line", count: 168, trend: 27 },
  { label: "Brand (entity)", count: 143, trend: 5 },
  { label: "City Commuter", count: 88, trend: -8 },
  { label: "Repair service", count: 44, trend: 17 },
];

export const demoSources = [
  { label: "Direct / unknown", value: 46 },
  { label: "utm_source=newsletter", value: 21 },
  { label: "referrer: reddit.com", value: 14 },
  { label: "utm_source=instagram", value: 12 },
  { label: "referrer: news.ycombinator.com", value: 7 },
];

export const demoMissing = [
  "No answer exists for “Which frame size fits 178 cm?” — asked 63 times.",
  "Shipping costs outside the EU are not covered in faq.md.",
  "Product X has no listed price or availability field.",
  "No spare-part policy documented, though it is a rising topic.",
];

export function windowRows(rows: DayRow[], days: number) {
  return rows.slice(Math.max(0, rows.length - days));
}

export function totals(rows: DayRow[]) {
  return rows.reduce(
    (acc, r) => ({
      conversations: acc.conversations + r.conversations,
      queries: acc.queries + r.queries,
      appearances: acc.appearances + r.appearances,
      outboundClicks: acc.outboundClicks + r.outboundClicks,
      crawlerReads: acc.crawlerReads + r.crawlerReads,
    }),
    { conversations: 0, queries: 0, appearances: 0, outboundClicks: 0, crawlerReads: 0 },
  );
}
