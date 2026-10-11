/**
 * What the app offers. Templates mirror the engine (src/templates.ts):
 * the engine test tests/web-parity.test.ts checks they agree.
 * Motion prompts are applied on the server, never taken from the browser.
 */
export type Gender = "female" | "male";

export interface AppTemplate {
  id: string;
  name: string;
  blurb: string;
  headline: string;
  videoDurationS: 5 | 10;
  defaultGender: Gender;
  motionPrompt: string;
  scriptStarter: string;
  photoHint: string;
}

export const APP_TEMPLATES: AppTemplate[] = [
  {
    id: "product-promo", name: "Product promo", headline: "New in", videoDurationS: 5, defaultGender: "female",
    blurb: "One product photo becomes a 15-second ad with a voiceover.",
    motionPrompt: "slow cinematic push-in on the product, soft studio light, gentle reflections, product stays sharp and centred",
    scriptStarter: "Welcome! New stock just landed. [Product name], only [price]. Order today on WhatsApp.",
    photoHint: "A clear photo of one product, ideally on a plain background.",
  },
  {
    id: "new-arrival", name: "New arrival", headline: "Just dropped", videoDurationS: 5, defaultGender: "male",
    blurb: "Announce fresh stock with an energetic reveal.",
    motionPrompt: "dynamic orbit around the product, light sweep across the surface, quick energetic reveal",
    scriptStarter: "It's here! [Product name] has just arrived. Limited stock, so come early.",
    photoHint: "Your new product, well lit.",
  },
  {
    id: "event-promo", name: "Event promo", headline: "You’re invited", videoDurationS: 5, defaultGender: "male",
    blurb: "Turn a flyer into a moving invitation for your event.",
    motionPrompt: "slow push-in on the flyer with subtle parallax, warm light, gentle particles in the air",
    scriptStarter: "You're invited! Join us on [day] at [time], [venue]. Bring a friend.",
    photoHint: "Your event flyer or a photo of the venue.",
  },
  {
    id: "church-announcement", name: "Church announcement", headline: "This Sunday", videoDurationS: 5, defaultGender: "male",
    blurb: "Sunday notices and programmes, ready before the service.",
    motionPrompt: "warm golden light, slow upward tilt, calm and uplifting atmosphere",
    scriptStarter: "This Sunday at [time], join us for [programme]. Everyone is welcome.",
    photoHint: "The church, the programme flyer or the speaker.",
  },
  {
    id: "creator-short", name: "Creator short", headline: "", videoDurationS: 5, defaultGender: "female",
    blurb: "Your photo, your words, posted in two languages.",
    motionPrompt: "natural handheld feel, slight zoom, lively but subtle movement in the scene",
    scriptStarter: "Here's something I wish I knew sooner: [your tip].",
    photoHint: "A photo of you, or the scene you're talking about.",
  },
  {
    id: "menu-reel", name: "Menu reel", headline: "Today’s special", videoDurationS: 5, defaultGender: "female",
    blurb: "A dish photo becomes a mouth-watering reel for your restaurant.",
    motionPrompt: "steam rising from the food, slow macro push-in, rich warm colours, appetising close-up",
    scriptStarter: "Hungry? Today's special is [dish]. Order now, delivered hot.",
    photoHint: "A close-up of the dish.",
  },
];

export const templateById = (id: string) => APP_TEMPLATES.find((t) => t.id === id);

export interface AppLanguage {
  code: string;
  name: string;
  example: string;
}

/** Order shown in the studio. Only languages the render worker has voices for are enabled. */
export const APP_LANGUAGES: AppLanguage[] = [
  { code: "twi", name: "Twi", example: "Akwaaba! Nneɛma foforo aba. Bra bɛtɔ wo de nnɛ." },
  { code: "en", name: "English", example: "Welcome! New stock just landed. Order today on WhatsApp." },
  { code: "yo", name: "Yorùbá", example: "Ẹ káàbọ̀! Ọ̀jà tuntun ti dé. Ẹ wá ra tiyín lónìí." },
  { code: "pcm", name: "Pidgin", example: "Welcome o! New market don land. Come buy your own today." },
  { code: "ha", name: "Hausa", example: "Barka da zuwa! Sabbin kaya sun iso. Ku zo ku saya yau." },
  { code: "fr", name: "Français", example: "Bienvenue ! Les nouveautés sont arrivées. Commandez dès aujourd’hui." },
  { code: "sw", name: "Swahili", example: "Karibu! Bidhaa mpya zimefika. Agiza leo." },
  { code: "ig", name: "Igbo", example: "Nnọọ! Ngwa ahịa ọhụrụ abịala." },
  { code: "ee", name: "Ewe", example: "Woezɔ! Nu yeyewo va." },
  { code: "gaa", name: "Ga", example: "Write your script in Ga." },
];

export const languageByCode = (code: string) => APP_LANGUAGES.find((l) => l.code === code);

export const LIMITS = {
  scriptChars: 1200,
  languages: 6,
  headline: 30,
  brand: 40,
  cta: 40,
  photoBytes: 10 * 1024 * 1024,
  photoTypes: ["image/jpeg", "image/png", "image/webp"] as string[],
};
