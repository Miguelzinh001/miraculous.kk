const bcrypt = require('bcryptjs');
const { db, sign, cookie, requireUser } = require('./_auth');

function json(res, status, body, extra = {}) {
  res.status(status).setHeader('Content-Type', 'application/json');
  Object.entries(extra).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
}

function clean(u) {
  return {
    id: u.id,
    username: u.username,
    photo: u.photo || '',
    bio: u.bio || '',
    role: u.role || 'user',
    admin: u.role === 'admin',
    flag: u.flag || '🌍',
    phrase: u.phrase || 'Claws out!',
    profileColor: u.profileColor || '#e62b45',
    xp: Number(u.xp || 0),
    createdAt: u.createdAt,
    lastSeen: u.lastSeen
  };
}

module.exports = async (req, res) => {
  try {
    const action = req.method === 'GET' ? (req.query?.action || 'me') : (req.body?.action || '');
    const sql = db();

    if (action === 'me') {
      const user = await requireUser(req);
      if (!user) return json(res, 401, { error: 'Não autenticado.' });
      return json(res, 200, { user: clean(user) });
    }

    if (action === 'logout') {
      return json(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });

    if (action === 'register') {
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');
      const photo = String(req.body?.photo || '');
      if (username.length < 3) return json(res, 400, { error: 'O nome precisa de ter pelo menos 3 caracteres.' });
      if (password.length < 4) return json(res, 400, { error: 'A palavra-passe precisa de ter pelo menos 4 caracteres.' });
      const exists = await sql`SELECT id FROM users WHERE LOWER(username)=LOWER(${username}) LIMIT 1`;
      if (exists.length) return json(res, 409, { error: 'Esse utilizador já existe.' });
      const hash = await bcrypt.hash(password, 12);
      const rows = await sql`
        INSERT INTO users (username, password_hash, photo, flag, last_seen)
        VALUES (${username}, ${hash}, ${photo}, '🌍', NOW())
        RETURNING id, username, photo, bio, role, flag, phrase,
                  profile_color AS "profileColor", xp,
                  created_at AS "createdAt", last_seen AS "lastSeen"`;
      const user = rows[0];
      return json(res, 201, { user: clean(user) }, { 'Set-Cookie': cookie(await sign(user)) });
    }

    if (action === 'login') {
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');
      const rows = await sql`
        SELECT id, username, password_hash, photo, bio, role, flag, phrase,
               profile_color AS "profileColor", xp,
               created_at AS "createdAt", last_seen AS "lastSeen"
        FROM users WHERE LOWER(username)=LOWER(${username}) LIMIT 1`;
      if (!rows.length) return json(res, 401, { error: 'Conta não encontrada.' });
      const user = rows[0];
      if (!(await bcrypt.compare(password, user.password_hash))) return json(res, 401, { error: 'Palavra-passe incorreta.' });
      await sql`UPDATE users SET last_seen=NOW() WHERE id=${user.id}`;
      delete user.password_hash;
      return json(res, 200, { user: clean(user) }, { 'Set-Cookie': cookie(await sign(user)) });
    }

    if (action === 'change-password') {
      const user = await requireUser(req);
      if (!user) return json(res, 401, { error: 'Não autenticado.' });
      const password = String(req.body?.password || '');
      if (password.length < 4) return json(res, 400, { error: 'A palavra-passe precisa de ter pelo menos 4 caracteres.' });
      const hash = await bcrypt.hash(password, 12);
      await sql`UPDATE users SET password_hash=${hash} WHERE id=${user.id}`;
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'Ação inválida.' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Erro interno do servidor.' });
  }
};
