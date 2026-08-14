const { db } = require('./_db');
module.exports = async (req, res) => {
  try {
    const sql = db();
    await sql`SELECT 1`;
    res.status(200).json({ ok: true, database: 'connected' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
