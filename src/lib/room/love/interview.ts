/**
 * The Crawler Love interview.
 *
 * One question per step, always skippable, resumable. No sexual questions, no
 * clinical attachment diagnoses, no manipulation, no sensitive inference:
 * gender identity, desired partner group, religion or politics are never
 * derived from names, images, texts or earlier chats — they are only stored
 * when the person states them for this purpose.
 */

export type LoveAnswerKind = "single" | "multi" | "text";

export interface LoveQuestion {
  id: string;
  area: string;
  prompt: string;
  kind: LoveAnswerKind;
  options?: string[];
  hint?: string;
}

export const LOVE_QUESTIONS: LoveQuestion[] = [
  {
    id: "relationship_intention",
    area: "Relationship intention",
    prompt: "What kind of relationship are you currently hoping to build?",
    kind: "single",
    options: [
      "Long-term committed relationship",
      "A relationship that can grow naturally",
      "Romantic connection without immediate expectations",
      "Not sure yet",
      "Prefer not to say",
    ],
  },
  {
    id: "values",
    area: "Values and life direction",
    prompt: "Which values feel most important in your life right now? Pick as many as you like.",
    kind: "multi",
    options: [
      "Creativity",
      "Stability",
      "Freedom",
      "Family",
      "Adventure",
      "Personal growth",
      "Community",
      "Spirituality",
      "Humor",
      "Career",
    ],
    hint: "Only what you choose yourself is stored. Nothing is inferred.",
  },
  {
    id: "communication_style",
    area: "Communication style",
    prompt: "When something matters to you, how do you prefer to communicate?",
    kind: "single",
    options: [
      "Calm and direct",
      "Warm and expressive",
      "Thoughtful, after some reflection",
      "Playful and light",
      "Written rather than spoken",
    ],
  },
  {
    id: "closeness_independence",
    area: "Closeness and independence",
    prompt: "What balance between closeness and personal independence feels right to you?",
    kind: "single",
    options: [
      "A lot of shared time",
      "Close, with clear personal space",
      "Balanced and flexible",
      "Independent, with meaningful time together",
    ],
  },
  {
    id: "conflict_repair",
    area: "Conflict",
    prompt: "What helps you repair connection after a disagreement?",
    kind: "single",
    options: [
      "Talking it through soon",
      "A short pause, then a calm conversation",
      "A clear apology and a plan",
      "Humor and warmth",
      "Written reflection",
    ],
  },
  {
    id: "emotional_expression",
    area: "Emotional expression",
    prompt: "How do you usually show affection and appreciation?",
    kind: "single",
    options: [
      "Words and encouragement",
      "Small everyday gestures",
      "Shared time and attention",
      "Practical support",
      "Physical closeness such as a hug",
    ],
  },
  {
    id: "daily_rhythm",
    area: "Everyday rhythm",
    prompt: "What kind of everyday rhythm would you enjoy sharing with a partner?",
    kind: "single",
    options: [
      "Calm and structured",
      "Creative and flexible",
      "Active and full of plans",
      "Slow mornings, quiet evenings",
      "A mix, depending on the week",
    ],
  },
  {
    id: "social_energy",
    area: "Social energy",
    prompt: "Do you prefer quiet time together, social activities, or a balance of both?",
    kind: "single",
    options: ["Mostly quiet time together", "A balance of both", "Mostly social activities"],
  },
  {
    id: "interests",
    area: "Interests",
    prompt: "Which interests would you enjoy sharing? You can also describe them in your own words.",
    kind: "multi",
    options: [
      "Art and design",
      "Music",
      "Nature and outdoors",
      "Sports and movement",
      "Books and writing",
      "Travel",
      "Technology",
      "Cooking and food",
      "Films and series",
      "Learning and ideas",
    ],
  },
  {
    id: "partner_preferences",
    area: "Partner qualities",
    prompt: "Which qualities would feel especially meaningful in a partner?",
    kind: "multi",
    options: [
      "Emotional honesty",
      "Curiosity",
      "Reliability",
      "Humor",
      "Ambition",
      "Calmness",
      "Kindness",
      "Independence",
      "Creativity",
      "Openness to growth",
    ],
  },
  {
    id: "boundaries",
    area: "Boundaries",
    prompt:
      "Are there general boundaries or dealbreakers you would like to name? This is entirely voluntary.",
    kind: "multi",
    options: [
      "Honesty is essential",
      "Non-smoking",
      "No frequent long distance",
      "Shared view on family planning",
      "Respect for personal space",
      "Prefer not to say",
    ],
    hint: "Keep it general. Never share intimate private details here.",
  },
  {
    id: "language_region",
    area: "Language and broad region",
    prompt:
      "Which language(s) would you like to speak with a partner, and roughly which region are you in? A country is enough.",
    kind: "text",
    hint: "Never an exact address or GPS position — a country code such as CH or DE is enough.",
  },
];

export const LOVE_QUESTION_COUNT = LOVE_QUESTIONS.length;

export type LoveAnswers = Record<string, { value: string[]; skipped: boolean }>;

export function questionById(id: string): LoveQuestion | null {
  return LOVE_QUESTIONS.find((q) => q.id === id) ?? null;
}

/** The single next unanswered question — the interview is never a form. */
export function nextQuestion(answers: LoveAnswers): LoveQuestion | null {
  return LOVE_QUESTIONS.find((q) => !answers[q.id]) ?? null;
}

export function progressOf(answers: LoveAnswers): number {
  const answered = LOVE_QUESTIONS.filter((q) => answers[q.id]).length;
  return Math.round((answered / LOVE_QUESTION_COUNT) * 100);
}

export function answeredCount(answers: LoveAnswers): number {
  return LOVE_QUESTIONS.filter((q) => answers[q.id]).length;
}

/** Splits a free-text or option answer into normalised values. */
export function normaliseAnswer(question: LoveQuestion, raw: unknown): string[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  if (question.kind === "multi") {
    return text
      .split(/[,;·|\n]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  return [text.slice(0, 300)];
}

const LANGUAGE_RE = /\b([a-z]{2})\b/g;
const REGION_RE = /\b([A-Z]{2})\b/g;

/** Extracts only coarse language codes and a country code — nothing precise. */
export function parseLanguageRegion(values: string[]): { languages: string[]; region: string | null } {
  const joined = values.join(" ");
  const languages = new Set<string>();
  const named: Record<string, string> = {
    german: "de",
    deutsch: "de",
    english: "en",
    französisch: "fr",
    french: "fr",
    italian: "it",
    italienisch: "it",
    spanish: "es",
    spanisch: "es",
  };
  for (const [word, code] of Object.entries(named)) {
    if (joined.toLowerCase().includes(word)) languages.add(code);
  }
  for (const match of joined.toLowerCase().matchAll(LANGUAGE_RE)) {
    const code = match[1]!;
    if (["de", "en", "fr", "it", "es", "pt", "nl", "pl", "tr", "sv"].includes(code)) languages.add(code);
  }
  let region: string | null = null;
  for (const match of joined.toUpperCase().matchAll(REGION_RE)) {
    const code = match[1]!;
    if (!["DE", "EN"].includes(code) || languages.size) {
      region = code;
      break;
    }
  }
  return { languages: [...languages].slice(0, 4), region };
}
