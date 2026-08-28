import crypto from 'node:crypto'

export function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function verifyTokenHash(token, storedHash) {
  if (!token || !storedHash) return false
  const hash = hashToken(token)
  try {
    const expected = Buffer.from(hash, 'hex')
    const actual = Buffer.from(storedHash, 'hex')
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}
