import * as Schema from "effect/Schema";

import { useLocalStorage } from "../../hooks/useLocalStorage";

export interface CodexBackground {
  readonly id: string;
  readonly src: string;
  readonly thumbnail: string;
  readonly title: string;
  readonly credit: string;
  readonly sourceUrl: string;
}

const METROPOLITAN = "The Met, public domain";
const UNSPLASH = "Unsplash";

function bundled(
  id: string,
  title: string,
  author: string,
  source: typeof METROPOLITAN | typeof UNSPLASH,
  sourceUrl: string,
): CodexBackground {
  return {
    id,
    src: `/backgrounds/${id}.webp`,
    thumbnail: `/backgrounds/${id}-thumb.webp`,
    title,
    credit: `${author} · ${source}`,
    sourceUrl,
  };
}

/**
 * Default new-chat backgrounds: calm, mid-tone scenes that stay readable under
 * both light and dark themes once the theme scrim sits on top. Paintings are
 * public domain (The Met Open Access, CC0); photos are free under the Unsplash
 * License. Files live in apps/web/public/backgrounds.
 */
export const BUNDLED_BACKGROUNDS: ReadonlyArray<CodexBackground> = [
  bundled(
    "hokusai-great-wave",
    "Under the Wave off Kanagawa",
    "Katsushika Hokusai",
    METROPOLITAN,
    "https://www.metmuseum.org/art/collection/search/45434",
  ),
  bundled(
    "bierstadt-rocky-mountains",
    "The Rocky Mountains, Lander's Peak",
    "Albert Bierstadt",
    METROPOLITAN,
    "https://www.metmuseum.org/art/collection/search/10154",
  ),
  bundled(
    "van-gogh-wheat-field",
    "Wheat Field with Cypresses",
    "Vincent van Gogh",
    METROPOLITAN,
    "https://www.metmuseum.org/art/collection/search/436535",
  ),
  bundled(
    "cole-oxbow",
    "View from Mount Holyoke (The Oxbow)",
    "Thomas Cole",
    METROPOLITAN,
    "https://www.metmuseum.org/art/collection/search/10497",
  ),
  bundled(
    "turner-whalers",
    "Whalers",
    "J. M. W. Turner",
    METROPOLITAN,
    "https://www.metmuseum.org/art/collection/search/437854",
  ),
  bundled(
    "bruegel-harvesters",
    "The Harvesters",
    "Pieter Bruegel the Elder",
    METROPOLITAN,
    "https://www.metmuseum.org/art/collection/search/435809",
  ),
  bundled(
    "misty-ridges",
    "Misty ridges",
    "Fabrizio Conti",
    UNSPLASH,
    "https://unsplash.com/photos/9CfajiGQL0o",
  ),
  bundled(
    "blue-ranges",
    "Blue ranges",
    "Alessio Soggetti",
    UNSPLASH,
    "https://unsplash.com/photos/PdGBci-4jR8",
  ),
  bundled(
    "foggy-hills",
    "Foggy hills",
    "Ricardo Gomez Angel",
    UNSPLASH,
    "https://unsplash.com/photos/dTSaC-S-7fs",
  ),
  bundled("dunes", "Dunes", "Zetong Li", UNSPLASH, "https://unsplash.com/photos/HEf0fKgJA1Q"),
  bundled("pink-sea", "Pink sea", "Clark Gu", UNSPLASH, "https://unsplash.com/photos/sbNlS7dWqKE"),
  bundled(
    "sunset-canyon",
    "Sunset canyon",
    "Navin Hardyal",
    UNSPLASH,
    "https://unsplash.com/photos/FIgVAQRO_QI",
  ),
];

/** "random" picks a new image for every new chat; otherwise the id of one image. */
export function useCodexBackgroundChoice() {
  return useLocalStorage("simplet3code:background-choice", "random", Schema.String);
}

export function useCodexBackgroundEnabled() {
  return useLocalStorage("simplet3code:background-enabled", true, Schema.Boolean);
}

/** Stable per new chat: the same draft keeps its image, the next one gets another. */
export function pickBackgroundForDraft<T>(pool: ReadonlyArray<T>, draftId: string): T | null {
  if (pool.length === 0) return null;
  let hash = 2166136261;
  for (let index = 0; index < draftId.length; index += 1) {
    hash = Math.imul(hash ^ draftId.charCodeAt(index), 16777619);
  }
  return pool[(hash >>> 0) % pool.length] ?? null;
}
