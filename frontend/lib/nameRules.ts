/**
 * What sign-up accepts as a name. Real names come in every script and carry
 * accents, apostrophes, hyphens and dots: O'Connor, Anne-Marie, François, Zoë,
 * St. John, مهدیار. Until 2026-11-27 only A to Z was allowed, which turned
 * away all of those, including anyone typing their name in Persian on a site
 * offered in Persian.
 *
 * The account stores one "First Last" string and splits it at the first
 * space, so a first name may not hold a space; a last name may (van der Berg).
 * Each part starts with a letter and is at most 30 characters.
 */

// Letters in any script, the marks some of them need (é written as e + ´,
// Persian vowel signs), the zero-width non-joiner Persian uses inside words,
// and straight or curly apostrophes, hyphens and dots.
const FIRST = /^\p{L}[\p{L}\p{M}‌'’.-]{0,29}$/u;
const LAST = /^\p{L}[\p{L}\p{M}‌'’. -]{0,29}$/u;

export const isFirstNameOk = (value: string) => FIRST.test(value.trim());

export const isLastNameOk = (value: string) => {
  const v = value.trim();
  return LAST.test(v) && !/ {2,}/.test(v);
};
