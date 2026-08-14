const { jwtVerify, SignJWT } = require('jose');
const { db } = require('./_db');

const secret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET não configurada.');
  return new TextEncoder().encode(process.env.JWT_SECRET);
};

async function sign(user) {
  return new SignJWT({ uid: user.id, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret());
}

function cookie(token, maxAge = 60 * 60 * 24 * 30) {
  return `miraculous_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function getToken(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(/(?:^|;\s*)miraculous_session=([^;]+)/);
  return match ? match[1] : null;
}

async function requireUser(req) {
  const token = getToken(req);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const sql = db();
    const rows = await sql`
      SELECT id, username, photo, bio, role, flag, phrase,
             profile_color AS "profileColor", xp,
             created_at AS "createdAt", last_seen AS "lastSeen"
      FROM users WHERE id = ${String(payload.uid)} LIMIT 1`;
    return rows[0] || null;
  } catch {
    return null;
  }
}

module.exports = { db, sign, cookie, requireUser };
