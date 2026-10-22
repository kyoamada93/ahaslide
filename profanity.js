'use strict';
// Small Vietnamese + English profanity filter for free-text input (word cloud, Q&A).
// Matches whole tokens, keeping Vietnamese diacritics: "các" or "lớn" never match "cặc" or "lồn".
const WORDS = [
  // Vietnamese (with diacritics) + common teencode / abbreviations
  'địt', 'đụ', 'lồn', 'cặc', 'buồi', 'đéo', 'đĩ', 'đểu', 'đjt', 'djt', 'dit me', 'đit',
  'đm', 'dm', 'đmm', 'dmm', 'đcm', 'dcm', 'đkm', 'dkm', 'vl', 'vcl', 'vkl', 'vãi lồn', 'vãi l', 'clgt', 'cl', 'cc', 'clm', 'cmm', 'đcmm',
  'óc chó', 'mặt lồn', 'con đĩ', 'thằng chó', 'đồ chó', 'ngu như chó',
  // English
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch', 'cunt', 'dick', 'asshole', 'bastard', 'pussy', 'whore', 'slut',
];

const norm = (s) => String(s || '').toLocaleLowerCase('vi').normalize('NFC');
const tokens = (s) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const single = new Set(WORDS.filter((w) => !w.includes(' ')).map(norm));
const phrases = WORDS.filter((w) => w.includes(' ')).map((w) => ` ${norm(w)} `);

// "đ.m", "v c l" → "đm", "vcl": merge runs of single-letter tokens.
function mergeLetters(t) {
  const out = [];
  for (const w of t) {
    if (w.length === 1 && out.length && out[out.length - 1].solo) out[out.length - 1].w += w;
    else out.push({ w, solo: w.length === 1 });
  }
  return out.map((x) => x.w);
}

function hasProfanity(text) {
  const t = mergeLetters(tokens(text));
  if (t.some((w) => single.has(w))) return true;
  const joined = ` ${t.join(' ')} `;
  return phrases.some((p) => joined.includes(p));
}

module.exports = { hasProfanity };
