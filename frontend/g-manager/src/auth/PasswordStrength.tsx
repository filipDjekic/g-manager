function strengthLevel(password: string) {
  if (!password) return 0
  if (password.length < 8 || /^(.)\1+$/.test(password) || /^(password|lozinka|qwerty|123456|abcdefgh)/i.test(password)) return 1
  const variety = Number(/\p{Ll}/u.test(password)) + Number(/\p{Lu}/u.test(password))
    + Number(/\p{N}/u.test(password)) + Number(/[^\p{L}\p{N}\s]/u.test(password))
  if ((password.length >= 16 && variety >= 2) || (password.length >= 12 && variety >= 3)) return 4
  if (password.length >= 12 || (password.length >= 10 && variety >= 2)) return 3
  return 2
}

export function PasswordStrength({ password }: { password: string }) {
  const level = strengthLevel(password)
  const labels = ['-', 'Slaba', 'Osrednja', 'Dobra', 'Jaka']

  return <div className="gm-auth-strength" data-level={level}>
    <div className="gm-auth-strength-segments" aria-hidden="true">
      {[1, 2, 3, 4].map((segment) => <span key={segment} data-active={segment <= level} />)}
    </div>
    <p className="gm-auth-strength-caption">
      <span>Jačina lozinke</span>
      <strong role="status" aria-label={`Jačina lozinke: ${labels[level]}`}>{labels[level]}</strong>
    </p>
  </div>
}
