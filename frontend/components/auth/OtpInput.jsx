'use client';

import { useRef } from 'react';

/**
 * Six-digit code entry.
 *
 * The 2FA screen has had this - six boxes that advance as you type, step back on backspace, and
 * accept a pasted code in one go - while account verification had a single text field asking for
 * the same six digits. Two screens asking the same question in two different shapes, one of them
 * without the paste handling that people actually use when the code is sitting in another tab.
 *
 * `value` is the whole code as a string; `onChange` receives it the same way, so a parent can keep
 * holding one piece of state.
 */
export default function OtpInput({
  value = '',
  onChange,
  disabled = false,
  accent = 'var(--gold)',
  autoFocus = false,
}) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  const emit = (next) => onChange?.(next.join('').slice(0, 6));

  const setAt = (idx, val) => {
    if (val && !/^\d$/.test(val)) return;
    const next = [...digits];
    next[idx] = val;
    emit(next);
    if (val && idx < 5) refs.current[idx + 1]?.focus();
  };

  const onKeyDown = (idx, e) => {
    // Backspace on an empty box steps back and clears the one before, which is what someone
    // correcting a typo expects - otherwise the caret sits still and nothing happens.
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      const next = [...digits];
      next[idx - 1] = '';
      emit(next);
      refs.current[idx - 1]?.focus();
    }
    if (e.key === 'ArrowLeft'  && idx > 0) refs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < 5) refs.current[idx + 1]?.focus();
  };

  const onPaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = [...digits];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    emit(next);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={(el) => (refs.current[idx] = el)}
          type="text"
          inputMode="numeric"
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && idx === 0}
          aria-label={`Digit ${idx + 1} of 6`}
          onChange={(e) => setAt(idx, e.target.value)}
          onKeyDown={(e) => onKeyDown(idx, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          style={{
            width: '48px',
            height: '56px',
            fontSize: '24px',
            fontWeight: 700,
            textAlign: 'center',
            borderRadius: '10px',
            border: `1.5px solid ${digit ? accent : 'var(--border)'}`,
            background: digit ? 'rgba(212,168,67,0.06)' : 'var(--dark)',
            color: 'var(--white)',
            outline: 'none',
            transition: 'border-color .15s ease, background .15s ease',
            opacity: disabled ? 0.6 : 1,
          }}
        />
      ))}
    </div>
  );
}
