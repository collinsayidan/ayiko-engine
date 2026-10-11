/** Landing-page content. Mirrors the engine's languages and templates. */

export interface Lang {
  code: string;
  name: string;
  /** Option label in the waitlist form */
  form: string;
  caption: string;
  meaning: string;
}

export const LANGS: Lang[] = [
  { code: "twi", name: "Twi", form: "Twi", caption: "Akwaaba! Nneɛma foforo aba.", meaning: "“Welcome! New stock has arrived.”" },
  { code: "yo", name: "Yorùbá", form: "Yoruba", caption: "Ẹ káàbọ̀! Ọ̀jà tuntun ti dé.", meaning: "“Welcome! New goods have arrived.”" },
  { code: "pcm", name: "Pidgin", form: "Nigerian Pidgin", caption: "Welcome o! New market don land.", meaning: "“Welcome! New stock has arrived.”" },
  { code: "ha", name: "Hausa", form: "Hausa", caption: "Barka da zuwa! Sabbin kaya sun iso.", meaning: "“Welcome! New goods have arrived.”" },
  { code: "en", name: "English", form: "English", caption: "Welcome! New stock just landed.", meaning: "" },
  { code: "fr", name: "Français", form: "French", caption: "Bienvenue ! Les nouveautés sont arrivées.", meaning: "“Welcome! The new arrivals are here.”" },
  { code: "sw", name: "Swahili", form: "Swahili", caption: "Karibu! Bidhaa mpya zimefika.", meaning: "“Welcome! New products have arrived.”" },
];

export type IconName = "bottle" | "spark" | "ticket" | "mega" | "person" | "bowl" | "link" | "face";

export interface Template {
  id: string;
  name: string;
  blurb: string;
  icon: IconName;
  tone: string;
  lang: string;
  ready: boolean;
  idea: string;
}

export const TEMPLATES: Template[] = [
  { id: "product-promo", name: "Product promo", blurb: "One product photo becomes a 15-second ad with a voiceover.", icon: "bottle", tone: "t1", lang: "twi", ready: true, idea: "A 15-second promo for my shea butter. Say: New stock just landed, order today on WhatsApp." },
  { id: "new-arrival", name: "New arrival", blurb: "Announce fresh stock with an energetic reveal.", icon: "spark", tone: "t2", lang: "pcm", ready: true, idea: "Big reveal for my new sneakers drop. Limited stock, come early." },
  { id: "event-promo", name: "Event promo", blurb: "Turn a flyer into a moving invitation for your event.", icon: "ticket", tone: "t3", lang: "en", ready: true, idea: "Invite people to our launch party on Saturday at 7pm. Bring a friend." },
  { id: "church-announcement", name: "Church announcement", blurb: "Sunday notices and programmes, ready before the service.", icon: "mega", tone: "t4", lang: "yo", ready: true, idea: "Harvest thanksgiving this Sunday at 10am. Everyone is welcome." },
  { id: "creator-short", name: "Creator short", blurb: "Your photo, your words, posted in two languages.", icon: "person", tone: "t5", lang: "pcm", ready: true, idea: "Share my top tip for saving money as a student, in a friendly tone." },
  { id: "menu-reel", name: "Menu reel", blurb: "A dish photo becomes a mouth-watering reel for your restaurant.", icon: "bowl", tone: "t6", lang: "twi", ready: true, idea: "Today's special is jollof with grilled chicken. Order now, delivered hot." },
  { id: "url-to-video", name: "Link to video", blurb: "Paste a product link and Ayiko builds the ad.", icon: "link", tone: "t7", lang: "en", ready: false, idea: "" },
  { id: "talking-avatar", name: "Talking presenter", blurb: "A presenter who speaks your script, lip-synced.", icon: "face", tone: "t8", lang: "en", ready: false, idea: "" },
];

export const QUICK: [label: string, templateId: string, lang: string][] = [
  ["Shea butter promo in Twi", "product-promo", "twi"],
  ["Sneaker drop in Pidgin", "new-arrival", "pcm"],
  ["Harvest service notice in Yoruba", "church-announcement", "yo"],
  ["Jollof special in English", "menu-reel", "en"],
];


/** Showcase videos rendered by the engine (scripts/make-showcase.ts). */
export interface Showcase { lang: string; caption: string; meaning: string }
export const SHOWCASE: Record<string, Showcase> = {
  "product-promo": { lang: "twi", caption: "Akwaaba! Nneɛma foforo aba.", meaning: "Twi · “Welcome! New stock has arrived. Come and buy yours today.”" },
  "new-arrival": { lang: "pcm", caption: "E don land!", meaning: "Pidgin · “It's here! New sneakers just dropped. Come early, stock is limited.”" },
  "event-promo": { lang: "en", caption: "You're invited!", meaning: "English · event invite with an RSVP button" },
  "church-announcement": { lang: "yo", caption: "Ẹ káàbọ̀!", meaning: "Yorùbá · “Welcome! Thanksgiving service this Sunday. Do come!”" },
  "creator-short": { lang: "en", caption: "Here's my top tip", meaning: "English · a creator tip with a follow button" },
  "menu-reel": { lang: "twi", caption: "Jollof ne nkokɔ aba!", meaning: "Twi · “Jollof and chicken are here! Buy yours today.”" },
};
/** "Welcome" in the languages Ayiko speaks, for the hero ticker */
export const GREETINGS: [word: string, language: string, code: string][] = [
  ["Akwaaba", "Twi", "tw"],
  ["Ẹ káàbọ̀", "Yorùbá", "yo"],
  ["Welcome o", "Pidgin", "pcm"],
  ["Barka da zuwa", "Hausa", "ha"],
  ["Welcome", "English", "en"],
  ["Bienvenue", "Français", "fr"],
  ["Karibu", "Swahili", "sw"],
  ["Nnọọ", "Igbo", "ig"],
  ["Woezɔ", "Ewe", "ee"],
];
/** Languages with a Language Multiplier video of the serum promo */
export const MULTI_LANGS = ["twi", "yo", "pcm", "ha", "en", "fr"];

/** Plans shown on the pricing section. `id` travels through sign-up as ?plan= */
export interface Plan { id: string; name: string; price: string; period: string; credits: string; perks: string[]; cta: string; popular?: boolean }
export const PLANS: Plan[] = [
  { id: "free", name: "Free trial", price: "£0", period: "", credits: "20 credits once", perks: ["About 1 video plus extras", "Every template", "Small ayiko.ai mark"], cta: "Start free" },
  { id: "starter", name: "Starter pack", price: "£5", period: "one-off", credits: "60 credits", perks: ["About 4 videos", "No watermark", "Credits never expire"], cta: "Choose Starter" },
  { id: "creator", name: "Creator", price: "£15", period: "/ month", credits: "220 credits a month", perks: ["About 16 videos", "Language Multiplier", "No watermark"], cta: "Choose Creator", popular: true },
  { id: "business", name: "Business", price: "£39", period: "/ month", credits: "650 credits a month", perks: ["About 50 videos", "Priority queue", "No watermark"], cta: "Choose Business" },
];
export const planById = (id?: string | null) => PLANS.find((p) => p.id === id);

export const langBy = (code: string) => LANGS.find((l) => l.code === code) ?? LANGS[0]!;
export const tplBy = (id: string) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]!;

/** Same estimate as the engine's credit quote */
export function estimateCredits(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length || 12;
  const blocks = Math.max(1, Math.ceil(Math.max(2, words / 2.5) / 30));
  return blocks * 2 + 10 + 1;
}
