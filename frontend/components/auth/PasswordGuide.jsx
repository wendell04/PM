'use client';

export const PASSWORD_RULES = [
  {label: 'At least 8 characters', test: (p) => p.length >= 8},
  {label: 'One uppercase letter',  test: (p) => /[A-Z]/.test(p)},
  {label: 'One lowercase letter',  test: (p) => /[a-z]/.test(p)},
  {label: 'One number',            test: (p) => /\d/.test(p)},
  {label: 'One special character', test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p)},
];

export const passwordIsStrong = (p) => p.length > 0 && PASSWORD_RULES.every(r => r.test(p));

/** Thin strength bar - the only thing shown once the field loses focus (and only until strong). */
export const PasswordStrength = ({password}) => {
  const score = PASSWORD_RULES.filter(r => r.test(password)).length;
  const levels = [
    {label: 'Too Weak',    color: 'var(--red)',   width: '20%'},
    {label: 'Weak',        color: 'var(--red)',   width: '40%'},
    {label: 'Fair',        color: 'var(--gold)',  width: '60%'},
    {label: 'Strong',      color: 'var(--green)', width: '80%'},
    {label: 'Very Strong', color: 'var(--green)', width: '100%'},
  ];
  const isTooLong = password.length > 32;
  const current   = levels[score - 1] || levels[0];

  return (
    <div>
      <div style={{height:'4px',borderRadius:'999px',background:'rgba(128,128,128,0.2)',overflow:'hidden'}}>
        <div style={{height:'100%',borderRadius:'999px',
          width: isTooLong ? '100%' : current.width,
          background: isTooLong ? 'var(--red)' : current.color,
          transition:'width 0.3s ease, background 0.3s ease'}}/>
      </div>
      <div style={{fontSize:'0.72rem',marginTop:'0.25rem',color: isTooLong ? 'var(--red)' : current.color}}>
        {isTooLong ? 'Too Long - recommended max 32 characters' : current.label}
      </div>
    </div>
  );
};

/**
 * Password rules helper.
 *  - While the field is FOCUSED: a floating popover (does not push the layout) listing only the
 *    rules still MISSING - a rule disappears once met and returns if broken.
 *  - When NOT focused: just the strength bar, and only until every rule passes.
 *  - Once strong and unfocused: nothing at all.
 * The parent field must be position:relative for the popover to anchor correctly.
 */
export const PasswordGuide = ({password, focused}) => {
  const missing  = PASSWORD_RULES.filter(r => !r.test(password));
  const isStrong = passwordIsStrong(password);

  if (focused) {
    return (
      <div
        style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0,
          width: '100%', minWidth: '220px', maxWidth: '320px',
          background: 'var(--dark2, #1f1f1f)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '0.75rem',
          boxShadow: '0 10px 28px rgba(0,0,0,0.28)', zIndex: 60,
        }}
      >
        {/* caret pointing at the field */}
        <div style={{
          position: 'absolute', top: '-5px', left: '18px', width: '9px', height: '9px',
          background: 'var(--dark2, #1f1f1f)', borderLeft: '1px solid var(--border)',
          borderTop: '1px solid var(--border)', transform: 'rotate(45deg)',
        }}/>
        {missing.length > 0 && (
          <div style={{display:'flex',flexDirection:'column',gap:'0.4rem'}}>
            {missing.map(r => (
              <div key={r.label} style={{display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'0.78rem',color:'var(--gray)'}}>
                <span style={{fontSize:'0.72rem'}}>·</span>{r.label}
              </div>
            ))}
          </div>
        )}
        <div style={{marginTop: missing.length > 0 ? '0.55rem' : 0}}>
          <PasswordStrength password={password}/>
        </div>
      </div>
    );
  }

  if (password.length > 0 && !isStrong) {
    return <div style={{marginTop:'0.5rem'}}><PasswordStrength password={password}/></div>;
  }
  return null;
};

/**
 * The rules in full, under the field, whether or not it has focus: each one ticks as it is met, with
 * the strength bar below. For screens where a popover gets clipped or goes unnoticed - a staff member
 * setting a first password from an invite saw no rules at all and learned them from the error.
 */
export const PasswordChecklist = ({password}) => (
  <div style={{marginTop:'0.5rem',display:'flex',flexDirection:'column',gap:'0.35rem'}}>
    {PASSWORD_RULES.map(r => {
      const ok = r.test(password);
      return (
        <div key={r.label} style={{display:'flex',alignItems:'center',gap:'0.45rem',fontSize:'0.78rem',color: ok ? 'var(--green)' : 'var(--gray)'}}>
          <span aria-hidden="true" style={{width:'14px',display:'inline-flex',justifyContent:'center'}}>
            {ok
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              : <span style={{width:'6px',height:'6px',borderRadius:'50%',background:'currentColor',opacity:0.5}}/>}
          </span>
          <span>{r.label}</span>
        </div>
      );
    })}
    {password.length > 0 && <div style={{marginTop:'0.2rem'}}><PasswordStrength password={password}/></div>}
  </div>
);

export default PasswordGuide;
