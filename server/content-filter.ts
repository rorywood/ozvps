const badWords = [
  'fuck', 'shit', 'ass', 'asshole', 'bitch', 'damn', 'crap', 'bastard', 'cunt',
  'dick', 'cock', 'pussy', 'whore', 'slut', 'fag', 'faggot', 'nigger',
  'nigga', 'retard', 'porn', 'porno', 'xxx', 'nsfw', 'hentai', 'nude',
  'nudes', 'naked', 'sex', 'sexy', 'onlyfans', 'fansly', 'chaturbate',
  'pornhub', 'xvideos', 'xhamster', 'redtube', 'youporn', 'brazzers',
  'shithead', 'dickhead', 'asshat', 'dumbass', 'jackass', 'motherfucker',
  'fucker', 'fucking', 'fucked', 'shitting', 'shitted', 'bitchy',
  'asses', 'dicks', 'cocks', 'pussies', 'sluts', 'whores', 'cunts'
];

const badWordsSet = new Set(badWords.map(w => w.toLowerCase()));

export function containsProfanity(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  for (const word of badWords) {
    if (lowerText.includes(word)) {
      return true;
    }
  }
  
  const normalized = lowerText.replace(/[\-_.\s]/g, '');
  for (const word of badWords) {
    if (normalized.includes(word)) {
      return true;
    }
  }
  
  return false;
}

export function cleanText(text: string): string {
  let result = text;
  for (const word of badWords) {
    const regex = new RegExp(word, 'gi');
    result = result.replace(regex, '*'.repeat(word.length));
  }
  return result;
}

export function validateServerName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: 'Server name cannot be empty' };
  }
  
  if (trimmed.length > 48) {
    return { valid: false, error: 'Server name must be 48 characters or less' };
  }
  
  if (trimmed.length < 2) {
    return { valid: false, error: 'Server name must be at least 2 characters' };
  }
  
  if (containsProfanity(trimmed)) {
    return { valid: false, error: 'Server name contains inappropriate content' };
  }
  
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9\s\-_.]*$/;
  if (!validPattern.test(trimmed)) {
    return { valid: false, error: 'Server name can only contain letters, numbers, spaces, hyphens, underscores, and periods' };
  }
  
  return { valid: true };
}
