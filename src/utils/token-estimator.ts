/**
 * Estimates token count from text without calling external APIs.
 * Uses the common approximation: ~4 characters per token for English text,
 * adjusted for code (denser token usage) and whitespace.
 */

const AVG_CHARS_PER_TOKEN = 4;
const CODE_CHARS_PER_TOKEN = 3; // code is denser

export interface TokenEstimate {
  tokens: number;
  characters: number;
  ratio: number; // chars per token
}

export function estimateTokens(text: string): TokenEstimate {
  const characters = text.length;

  // Detect if content is primarily code
  const codeIndicators = ['{', '}', '=>', '::', '()', '[]', '#!/'];
  const isCodeHeavy = codeIndicators.filter(ind => text.includes(ind)).length >= 3;

  const charsPerToken = isCodeHeavy ? CODE_CHARS_PER_TOKEN : AVG_CHARS_PER_TOKEN;
  const tokens = Math.ceil(characters / charsPerToken);

  return { tokens, characters, ratio: charsPerToken };
}

export function estimateTokensForMessages(messages: string[]): number {
  return messages.reduce((total, msg) => total + estimateTokens(msg).tokens, 0);
}

export function tokensToChars(tokens: number, isCode = false): number {
  return tokens * (isCode ? CODE_CHARS_PER_TOKEN : AVG_CHARS_PER_TOKEN);
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K tokens`;
  }
  return `${tokens} tokens`;
}
