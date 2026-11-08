// Forward-only voice following. Pure, so it can be tested.
export function normalize(w: string) {
  return w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "").replace(/'/g, "");
}

export function tokenize(text: string) {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Given script words, current position (index of next word to read) and the latest
 * recognized phrase, return the new position. Only searches a short window ahead,
 * so repeated phrases earlier in the script can never pull the reader backward.
 */
export function advance(scriptWords: string[], pos: number, spoken: string, windowSize = 12): number {
  const said = tokenize(spoken).map(normalize).filter(Boolean).slice(-4);
  if (!said.length) return pos;
  const norm = scriptWords.map(normalize);
  const end = Math.min(norm.length, pos + windowSize);
  // Prefer longest match of the spoken tail, earliest in the window.
  for (let len = said.length; len >= 1; len--) {
    const tail = said.slice(-len);
    if (len === 1 && tail[0].length < 3) continue; // tiny words are too ambiguous alone
    for (let i = pos; i + len <= end; i++) {
      let ok = true;
      for (let k = 0; k < len; k++) if (norm[i + k] !== tail[k]) { ok = false; break; }
      if (ok) return Math.max(pos, i + len);
    }
  }
  return pos;
}
