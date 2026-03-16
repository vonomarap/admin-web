import { kanevskyPlaces, type KanevskyPlace } from "./kanevskyPlaces";
import { normalizeGeoText } from "./normalizeGeoText";

type PlaceMatcher = {
  place: KanevskyPlace;
  phrase: string;
  tokens: readonly string[];
  tokenSet: ReadonlySet<string>;
  scoreBase: number;
};

function tokenizeNormalized(value: string): string[] {
  if (!value) return [];
  return value.split(" ").map((t) => t.trim()).filter(Boolean);
}

function buildMatcher(place: KanevskyPlace): PlaceMatcher {
  const phrase = normalizeGeoText(place.name);
  const tokens = tokenizeNormalized(phrase);
  const tokenSet = new Set(tokens);
  const scoreBase = tokens.reduce((acc, token) => acc + token.length, 0);
  return { place, phrase, tokens, tokenSet, scoreBase };
}

const matchers: readonly PlaceMatcher[] = kanevskyPlaces.map(buildMatcher);

export type AddressMatchResult = {
  place: KanevskyPlace;
  score: number;
};

export function matchKanevskyPlaceFromAddress(address: string): AddressMatchResult | null {
  const normalized = normalizeGeoText(address);
  if (!normalized) return null;

  const addrTokens = tokenizeNormalized(normalized);
  if (!addrTokens.length) return null;
  const addrTokenSet = new Set(addrTokens);

  let best: AddressMatchResult | null = null;

  for (const matcher of matchers) {
    if (!matcher.tokens.length) continue;

    let allTokensPresent = true;
    for (const token of matcher.tokenSet) {
      if (!addrTokenSet.has(token)) {
        allTokensPresent = false;
        break;
      }
    }
    if (!allTokensPresent) continue;

    const phraseBonus = normalized.includes(matcher.phrase) ? matcher.phrase.length : 0;
    const score = matcher.scoreBase + phraseBonus;

    if (!best || score > best.score) best = { place: matcher.place, score };
  }

  return best;
}

