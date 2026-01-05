import { Filter } from 'bad-words';

const filter = new Filter();

const additionalBadWords = [
  'porn', 'porno', 'xxx', 'nsfw', 'hentai', 'nude', 'nudes', 'naked',
  'sex', 'sexy', 'onlyfans', 'fansly', 'chaturbate', 'pornhub',
  'xvideos', 'xhamster', 'redtube', 'youporn', 'brazzers'
];

filter.addWords(...additionalBadWords);

export function containsProfanity(text: string): boolean {
  return filter.isProfane(text);
}

export function cleanText(text: string): string {
  return filter.clean(text);
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
