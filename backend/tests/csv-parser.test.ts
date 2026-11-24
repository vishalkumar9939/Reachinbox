import { describe, it, expect } from 'vitest';

export const parseRecipientsString = (content: string) => {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
  const rawTokens = content
    .split(/[\r\n,;\t]+/)
    .map((t) => t.trim().replace(/^[<"']+|[>"']+$/g, ''))
    .filter(Boolean);

  const validEmails: string[] = [];
  const invalidEmails: string[] = [];
  const seen = new Set<string>();
  let duplicatesCount = 0;

  for (const token of rawTokens) {
    if (!emailRegex.test(token)) {
      invalidEmails.push(token);
    } else {
      const lower = token.toLowerCase();
      if (seen.has(lower)) {
        duplicatesCount++;
      } else {
        seen.add(lower);
        validEmails.push(lower);
      }
    }
  }

  return {
    validEmails,
    invalidEmails,
    duplicatesCount,
  };
};

describe('CSV & TXT Recipient Parsing Logic', () => {
  it('should parse comma-separated email addresses correctly', () => {
    const raw = 'alice@example.com, bob@company.io, charlie@startup.org';
    const result = parseRecipientsString(raw);

    expect(result.validEmails).toEqual([
      'alice@example.com',
      'bob@company.io',
      'charlie@startup.org',
    ]);
    expect(result.invalidEmails).toHaveLength(0);
    expect(result.duplicatesCount).toBe(0);
  });

  it('should handle multiline and tab-delimited files', () => {
    const raw = `user1@domain.com\tuser2@domain.com\r\nuser3@domain.com; user4@domain.com`;
    const result = parseRecipientsString(raw);

    expect(result.validEmails).toEqual([
      'user1@domain.com',
      'user2@domain.com',
      'user3@domain.com',
      'user4@domain.com',
    ]);
  });

  it('should separate invalid addresses from valid ones', () => {
    const raw = `valid@mail.com, not-an-email, test@domain..com, @nodomain.com, proper.lead@corp.ai`;
    const result = parseRecipientsString(raw);

    expect(result.validEmails).toEqual(['valid@mail.com', 'proper.lead@corp.ai']);
    expect(result.invalidEmails).toContain('not-an-email');
    expect(result.invalidEmails).toContain('@nodomain.com');
  });

  it('should detect and remove duplicate recipients safely', () => {
    const raw = `lead@target.com, Lead@Target.com, LEAD@TARGET.COM, another@target.com`;
    const result = parseRecipientsString(raw);

    expect(result.validEmails).toEqual(['lead@target.com', 'another@target.com']);
    expect(result.duplicatesCount).toBe(2);
  });

  it('should sanitize enclosing quotes and angle brackets', () => {
    const raw = `"<quoted@domain.com>", '<single@domain.com>', "lead@firm.com"`;
    const result = parseRecipientsString(raw);

    expect(result.validEmails).toEqual([
      'quoted@domain.com',
      'single@domain.com',
      'lead@firm.com',
    ]);
  });
});
