/**
 * Ayiko's language catalogue and voice routing table.
 *
 * Each language lists voice candidates in order of preference. The router
 * tries them in order and falls back to the next if a provider fails or has
 * no API key. Change the order here after the native-speaker blind test.
 */

export type LanguageCode = "en" | "fr" | "sw" | "ha" | "yo" | "ig" | "pcm" | "twi" | "ee" | "gaa";
export type Gender = "female" | "male";
export type VoiceProviderId = "elevenlabs" | "khaya" | "naijalingo";

export interface VoiceCandidate {
  provider: VoiceProviderId;
  /** Provider-specific language code */
  providerLang: string;
  /** Provider voice/speaker id per gender. `env:` prefix reads from config. */
  voices: Record<Gender, string>;
}

export interface Language {
  code: LanguageCode;
  name: string;
  status: "launch" | "next" | "later";
  candidates: VoiceCandidate[];
}

const eleven = (providerLang: string): VoiceCandidate => ({
  provider: "elevenlabs",
  providerLang,
  voices: { female: "env:ELEVENLABS_VOICE_FEMALE", male: "env:ELEVENLABS_VOICE_MALE" },
});

const khaya = (providerLang: string): VoiceCandidate => ({
  provider: "khaya",
  providerLang,
  voices: { female: "female", male: "male" },
});

const naija = (providerLang: string, female: string, male: string): VoiceCandidate => ({
  provider: "naijalingo",
  providerLang,
  voices: { female, male },
});

export const LANGUAGES: Record<LanguageCode, Language> = {
  en: { code: "en", name: "English", status: "launch", candidates: [eleven("en")] },
  twi: { code: "twi", name: "Twi", status: "launch", candidates: [khaya("twi")] },
  yo: {
    code: "yo", name: "Yoruba", status: "launch",
    candidates: [naija("yo", "adeola_yo", "adekunle_yo"), khaya("yo")],
  },
  pcm: {
    code: "pcm", name: "Nigerian Pidgin", status: "launch",
    candidates: [naija("pcm", "ada_pcm", "blessing_pcm")],
  },
  ha: {
    code: "ha", name: "Hausa", status: "next",
    candidates: [naija("ha", "aisha_ha", "bello_ha"), eleven("ha"), khaya("hau")],
  },
  fr: { code: "fr", name: "French", status: "next", candidates: [eleven("fr")] },
  sw: { code: "sw", name: "Swahili", status: "later", candidates: [eleven("sw")] },
  ig: {
    code: "ig", name: "Igbo", status: "later",
    candidates: [naija("ig", "adaeze_ig", "ifeanyi_ig"), khaya("ibo")],
  },
  ee: { code: "ee", name: "Ewe", status: "later", candidates: [khaya("ewe")] },
  gaa: { code: "gaa", name: "Ga", status: "later", candidates: [khaya("gaa")] },
};

export function isLanguageCode(x: string): x is LanguageCode {
  return Object.prototype.hasOwnProperty.call(LANGUAGES, x);
}
