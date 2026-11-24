import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test_secret_key_1234567890_reachinbox';

describe('Authentication & JWT Session Security', () => {
  it('should successfully issue and decode valid user session token', () => {
    const user = {
      id: 'usr-12345',
      email: 'founder@startup.co',
      name: 'Sarah Connor',
    };

    const token = jwt.sign(user, TEST_JWT_SECRET, { expiresIn: '1h' });
    expect(typeof token).toBe('string');

    const decoded = jwt.verify(token, TEST_JWT_SECRET) as typeof user;
    expect(decoded.id).toBe(user.id);
    expect(decoded.email).toBe(user.email);
    expect(decoded.name).toBe(user.name);
  });

  it('should throw error when verifying with wrong secret', () => {
    const token = jwt.sign({ id: 'usr-123' }, TEST_JWT_SECRET);
    expect(() => jwt.verify(token, 'invalid_secret')).toThrow();
  });

  it('should detect and reject expired JWT sessions', () => {
    const expiredToken = jwt.sign({ id: 'usr-123' }, TEST_JWT_SECRET, { expiresIn: '-1s' });
    expect(() => jwt.verify(expiredToken, TEST_JWT_SECRET)).toThrow();
  });
});
