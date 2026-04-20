import { describe, it, expect } from 'vitest';
import { isSensitiveLabel, MAX_FIELD_SIZE, MAX_TOTAL_SIZE } from '@/lib/capture/sensitive';

describe('isSensitiveLabel', () => {
  it('matches Chinese sensitive terms', () => {
    expect(isSensitiveLabel('身份证号')).toBe(true);
    expect(isSensitiveLabel('验证码')).toBe(true);
    expect(isSensitiveLabel('银行卡号')).toBe(true);
    expect(isSensitiveLabel('密码')).toBe(true);
  });

  it('matches English sensitive terms', () => {
    expect(isSensitiveLabel('idCard')).toBe(true);
    expect(isSensitiveLabel('id-card')).toBe(true);
    expect(isSensitiveLabel('captcha')).toBe(true);
    expect(isSensitiveLabel('Verify Code')).toBe(true);
    expect(isSensitiveLabel('bankCard')).toBe(true);
    expect(isSensitiveLabel('Password')).toBe(true);
    expect(isSensitiveLabel('PIN')).toBe(true);
  });

  it('returns false for ordinary labels', () => {
    expect(isSensitiveLabel('email')).toBe(false);
    expect(isSensitiveLabel('姓名')).toBe(false);
    expect(isSensitiveLabel('school')).toBe(false);
  });

  it('returns false on empty or whitespace', () => {
    expect(isSensitiveLabel('')).toBe(false);
    expect(isSensitiveLabel('   ')).toBe(false);
  });
});

describe('size constants', () => {
  it('exposes documented limits', () => {
    expect(MAX_FIELD_SIZE).toBe(50 * 1024);
    expect(MAX_TOTAL_SIZE).toBe(500 * 1024);
  });
});
