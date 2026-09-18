// Chat politeness filter.
//
// The first version joined every blocked word into one alternation and tested it as a plain
// substring. In a Tagalog-speaking shop that is not a small flaw - it blocked "gagawin" (contains
// "gaga"), "password" and "Please pass po" (contain "ass"), "glass mug", "classic", "appetite"
// (contains "tite"), "leche flan", "computation" and "reputation" (contain "puta"). Seventeen of
// twenty-two ordinary sentences were refused. A customer who cannot type "Ano po gagawin?" simply
// leaves, and the shop never learns why.
//
// Two lists now, because the two kinds of word need opposite treatment:
//
//   EXACT     - short or ambiguous words, matched only as whole words. "ass" no longer fires
//               inside "password", but still fires on its own.
//   ANYWHERE  - long unambiguous strings, matched as substrings on purpose, so that running the
//               words together to sneak past ("putanginamo") still catches. Nothing here is short
//               enough to appear inside an ordinary word.
//
// Deliberately NOT blocked, because they are ordinary vocabulary here and blocking them costs more
// than it saves: hayop (animal), peste (pest), leche (milk - "leche flan"), suso, damn, and pepe,
// which is a common Filipino nickname and has already been the subject of a customer's artwork.

const ANYWHERE = [
  // Long enough that a substring match cannot collide with a real word, and running the words
  // together is the usual way people try to slip these through.
  'putangina', 'putang ina', 'tangina', 'tang ina', 'tang-ina',
  'anak ng puta', 'anak ng bitch',
  'motherfucker', 'motherfucking',
  'hinayupak', 'tarantado', 'punyeta', 'gunggong',
  'pakingshet', 'pakingbet', 'pakshet',
  // Masked spellings. These end in a symbol, so a word-boundary test would not fire after them.
  'f*ck', 'f**k', 'sh*t', 'sh**', 'b*tch', 'a**hole',
];

const EXACT = [
  // English
  'fuck', 'fucking', 'fucked', 'shit', 'bitch', 'asshole', 'bastard', 'cunt',
  'dick', 'piss', 'cock', 'whore', 'slut', 'faggot', 'fag', 'nigger', 'nigga',
  'bullshit', 'jackass', 'dumbass', 'ass', 'twat', 'wanker', 'prick',
  // Tagalog / Filipino
  'puta', 'gago', 'gaga', 'gagong', 'bobo', 'tanga', 'ulol', 'lintik',
  'kupal', 'bwisit', 'pakyu', 'putcha', 'burat', 'tite', 'bilat',
  'kantot', 'jakol', 'ungas', 'engot',
];

const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ANYWHERE_RE = new RegExp(ANYWHERE.map(esc).join('|'), 'i');
// \b on both ends: the word must stand alone. Hyphens and apostrophes are non-word characters, so
// "gago-gago" still matches while "gagawin" does not.
const EXACT_RE = new RegExp('\\b(?:' + EXACT.map(esc).join('|') + ')\\b', 'i');

export function containsProfanity(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (!t) return false;
  return ANYWHERE_RE.test(t) || EXACT_RE.test(t);
}
