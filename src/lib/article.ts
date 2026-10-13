/**
 * The indefinite article read before a number: an 8–3 lead, an 11-game streak, an 80-win team, a 100-win
 * team. Numbers that start with "eight", or read "eleven" or "eighteen" in their leading group, take "an".
 */
export function article(value: number, capital = false): string {
 const word = /^8|^1[18](\d{3})*$/.test(String(Math.abs(Math.trunc(value)))) ? 'an' : 'a';
 return capital ? word[0].toUpperCase() + word.slice(1) : word;
}
