import type { Gender } from "./languages";
import type { AspectRatio } from "./render";

/**
 * Templates are Ayiko's version of TopView's "what agents can do" cards and
 * Higgsfield's presets: one tap fills in the motion, length, format and a
 * script starter, so a shop owner never writes a prompt from scratch.
 * The curated motion prompts are where quality comes from; tune them as
 * real outputs come in.
 */
export interface Template {
  id: string;
  name: string;
  /** One line shown on the template card */
  blurb: string;
  aspect: AspectRatio;
  videoDurationS: 5 | 10;
  motionPrompt: string;
  /** Shown as placeholder text in the script box */
  scriptStarter: string;
  defaultGender: Gender;
  /** What the user uploads */
  input: "product_photo" | "flyer" | "photo" | "menu_photo";
  status: "ready" | "soon";
}

export const TEMPLATES: Template[] = [
  {
    id: "product-promo",
    name: "Product promo",
    blurb: "One product photo becomes a 15-second ad with a voiceover.",
    aspect: "9:16", videoDurationS: 5, defaultGender: "female", input: "product_photo", status: "ready",
    motionPrompt: "slow cinematic push-in on the product, soft studio light, gentle reflections, product stays sharp and centred",
    scriptStarter: "Welcome! New stock just landed. [Product name], only [price]. Order today on WhatsApp.",
  },
  {
    id: "new-arrival",
    name: "New arrival",
    blurb: "Announce fresh stock with an energetic reveal.",
    aspect: "9:16", videoDurationS: 5, defaultGender: "male", input: "product_photo", status: "ready",
    motionPrompt: "dynamic orbit around the product, light sweep across the surface, quick energetic reveal",
    scriptStarter: "It's here! [Product name] has just arrived. Limited stock, so come early.",
  },
  {
    id: "event-promo",
    name: "Event promo",
    blurb: "Turn a flyer into a moving invitation for your event.",
    aspect: "9:16", videoDurationS: 5, defaultGender: "male", input: "flyer", status: "ready",
    motionPrompt: "slow push-in on the flyer with subtle parallax, warm light, gentle particles in the air",
    scriptStarter: "You're invited! Join us on [day] at [time], [venue]. Bring a friend.",
  },
  {
    id: "church-announcement",
    name: "Church announcement",
    blurb: "Sunday notices and programmes, ready before the service.",
    aspect: "9:16", videoDurationS: 5, defaultGender: "male", input: "flyer", status: "ready",
    motionPrompt: "warm golden light, slow upward tilt, calm and uplifting atmosphere",
    scriptStarter: "This Sunday at [time], join us for [programme]. Everyone is welcome.",
  },
  {
    id: "creator-short",
    name: "Creator short",
    blurb: "Your photo, your words, posted in two languages.",
    aspect: "9:16", videoDurationS: 5, defaultGender: "female", input: "photo", status: "ready",
    motionPrompt: "natural handheld feel, slight zoom, lively but subtle movement in the scene",
    scriptStarter: "Here's something I wish I knew sooner: [your tip].",
  },
  {
    id: "menu-reel",
    name: "Menu reel",
    blurb: "A dish photo becomes a mouth-watering reel for your restaurant.",
    aspect: "9:16", videoDurationS: 5, defaultGender: "female", input: "menu_photo", status: "ready",
    motionPrompt: "steam rising from the food, slow macro push-in, rich warm colours, appetising close-up",
    scriptStarter: "Hungry? Today's special is [dish]. Order now, delivered hot.",
  },
  {
    id: "url-to-video",
    name: "Link to video",
    blurb: "Paste a product link and Ayiko builds the ad.",
    aspect: "9:16", videoDurationS: 5, defaultGender: "female", input: "product_photo", status: "soon",
    motionPrompt: "slow cinematic push-in on the product, soft studio light",
    scriptStarter: "",
  },
  {
    id: "talking-avatar",
    name: "Talking presenter",
    blurb: "A presenter who speaks your script, lip-synced.",
    aspect: "9:16", videoDurationS: 10, defaultGender: "female", input: "photo", status: "soon",
    motionPrompt: "",
    scriptStarter: "",
  },
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
