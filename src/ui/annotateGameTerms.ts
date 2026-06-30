import {
  GAME_TERM_ENTRIES,
  type GameTermId,
  type GameTermLocale,
} from "./gameTermGlossary.ts";

export type GameTermTextSegment =
  | { kind: "text"; text: string }
  | { kind: "term"; termId: GameTermId; matchedText: string };

export type GameTermClickHandler = (
  termId: GameTermId,
  anchor: HTMLButtonElement,
) => void;

interface AliasMatch {
  alias: string;
  termId: GameTermId;
}

let sortedAliasCache: Map<GameTermLocale, AliasMatch[]> | null = null;

function getSortedAliases(locale: GameTermLocale): AliasMatch[] {
  if (!sortedAliasCache) {
    sortedAliasCache = new Map();
  }
  const cached = sortedAliasCache.get(locale);
  if (cached) return cached;

  const matches: AliasMatch[] = [];
  for (const entry of GAME_TERM_ENTRIES) {
    const aliases = entry.aliases?.[locale];
    if (!aliases) continue;
    for (const alias of aliases) {
      if (alias.length === 0) continue;
      matches.push({ alias, termId: entry.id });
    }
  }
  matches.sort(
    (a, b) =>
      b.alias.length - a.alias.length || a.alias.localeCompare(b.alias, "ja"),
  );
  sortedAliasCache.set(locale, matches);
  return matches;
}

export interface SegmentTextByGameTermsOptions {
  /** Skill card body: proprietary status names are not term-linked. */
  excludeTermIds?: ReadonlySet<GameTermId>;
  /** Skill card body: only link allowlisted inline term labels. */
  includeTermIds?: ReadonlySet<GameTermId>;
}

function isAliasMatchBlocked(
  text: string,
  pos: number,
  alias: string,
  termId: GameTermId,
): boolean {
  if (termId === "surrounding" && text[pos + alias.length] === "の") {
    return true;
  }
  if (termId === "moveLock" && text.startsWith("あり", pos + alias.length)) {
    return true;
  }
  return false;
}

/** Pure segmentation for tests and annotateGameTerms. Longest alias wins at each offset. */
export function segmentTextByGameTerms(
  text: string,
  locale: GameTermLocale,
  options?: SegmentTextByGameTermsOptions,
): GameTermTextSegment[] {
  const excludeTermIds = options?.excludeTermIds;
  const includeTermIds = options?.includeTermIds;
  const aliases = getSortedAliases(locale);
  if (aliases.length === 0 || text.length === 0) {
    return text.length > 0 ? [{ kind: "text", text }] : [];
  }

  const segments: GameTermTextSegment[] = [];
  let pos = 0;

  while (pos < text.length) {
    let matched: { termId: GameTermId; matchedText: string } | null = null;

    for (const candidate of aliases) {
      if (!text.startsWith(candidate.alias, pos)) continue;
      if (
        isAliasMatchBlocked(text, pos, candidate.alias, candidate.termId)
      ) {
        continue;
      }
      if (excludeTermIds?.has(candidate.termId)) continue;
      if (includeTermIds && !includeTermIds.has(candidate.termId)) continue;
      matched = { termId: candidate.termId, matchedText: candidate.alias };
      break;
    }

    if (matched) {
      segments.push({
        kind: "term",
        termId: matched.termId,
        matchedText: matched.matchedText,
      });
      pos += matched.matchedText.length;
      continue;
    }

    let nextPos = pos + 1;
    while (nextPos < text.length) {
      let foundAhead = false;
      for (const candidate of aliases) {
        if (!text.startsWith(candidate.alias, nextPos)) continue;
        if (
          isAliasMatchBlocked(text, nextPos, candidate.alias, candidate.termId)
        ) {
          continue;
        }
        if (excludeTermIds?.has(candidate.termId)) continue;
        if (includeTermIds && !includeTermIds.has(candidate.termId)) continue;
        foundAhead = true;
        break;
      }
      if (foundAhead) break;
      nextPos += 1;
    }

    segments.push({ kind: "text", text: text.slice(pos, nextPos) });
    pos = nextPos;
  }

  return segments;
}

export interface AnnotateGameTermsOptions {
  panelId?: string;
  excludeTermIds?: ReadonlySet<GameTermId>;
}

export function annotateGameTerms(
  text: string,
  locale: GameTermLocale,
  onTermClick: GameTermClickHandler,
  options?: AnnotateGameTermsOptions,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const panelId = options?.panelId;

  for (const segment of segmentTextByGameTerms(text, locale, options)) {
    if (segment.kind === "text") {
      fragment.appendChild(document.createTextNode(segment.text));
      continue;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "game-term-link";
    button.textContent = segment.matchedText;
    button.dataset.gameTermId = segment.termId;
    button.setAttribute("aria-expanded", "false");
    if (panelId) {
      button.setAttribute("aria-controls", panelId);
    }
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onTermClick(segment.termId, button);
    });
    fragment.appendChild(button);
  }

  return fragment;
}

/** Merge adjacent text segments (test helper). */
export function segmentsToPlainText(segments: GameTermTextSegment[]): string {
  return segments
    .map((segment) =>
      segment.kind === "text" ? segment.text : segment.matchedText,
    )
    .join("");
}
