const database = require("../config/dbConnect")();
const withTransaction = require("../config/dbConnect").withTransaction;

const User = {
  async create({ username, password, role = "user", publicKey, name, email, phone }) {
    if (!username || !password) throw new Error("아이디와 비밀번호를 입력해 주세요.");
    const [result] = await database.execute(
      "INSERT INTO users (username, password, role, publicKey, name, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [username, password, role, publicKey || null, name || null, email || null, phone || null],
    );
    return this.findById(result.insertId);
  },

  async findOne({ username }) {
    const [rows] = await database.execute(
      "SELECT id AS _id, username, password, account_type, role, publicKey, name, email, phone FROM users WHERE username = ?",
      [username],
    );
    return rows[0] || null;
  },

  async findById(id) {
    const [rows] = await database.execute(
      "SELECT id AS _id, username, account_type, role, publicKey, name, email, phone FROM users WHERE id = ?",
      [Number(id)],
    );
    return rows[0] || null;
  },

  async updatePublicKeyIfUninitialized(id, publicKey) {
    const [result] = await database.execute(
      "UPDATE users SET publicKey = ? WHERE id = ? AND (publicKey IS NULL OR (role = 'admin' AND publicKey = 'admin-no-encryption'))",
      [publicKey, Number(id)],
    );
    return result.affectedRows;
  },

  async findByOAuth(provider, subject) {
    const [rows] = await database.execute(`
      SELECT u.id AS _id, u.username, u.account_type, u.role, u.publicKey, u.name, u.email, u.phone
      FROM users u JOIN oauth_accounts o ON o.user_id = u.id
      WHERE o.provider = ? AND o.subject = ?
    `, [provider, subject]);
    return rows[0] || null;
  },

  async findAdmin() {
    const [rows] = await database.execute(
      "SELECT id AS _id, username, publicKey FROM users WHERE role = 'admin' LIMIT 1",
    );
    return rows[0] || null;
  },

  async createOAuthAccount({ provider, subject, username, password, name, email }) {
    return withTransaction(async (connection) => {
      const [result] = await connection.execute(
        "INSERT INTO users (username, password, account_type, role, name, email) VALUES (?, ?, ?, 'user', ?, ?)",
        [username, password, provider, name || null, email || null],
      );
      await connection.execute(
        "INSERT INTO oauth_accounts (provider, subject, user_id) VALUES (?, ?, ?)",
        [provider, subject, result.insertId],
      );
      const [rows] = await connection.execute(
        "SELECT id AS _id, username, account_type, role, publicKey, name, email, phone FROM users WHERE id = ?",
        [result.insertId],
      );
      return rows[0] || null;
    });
  },

  async updateOAuthProfile(id, { name, email }) {
    const [result] = await database.execute(`
      UPDATE users SET
        name = COALESCE(NULLIF(?, ''), name),
        email = COALESCE(NULLIF(?, ''), email)
      WHERE id = ?
    `, [name || "", email || "", Number(id)]);
    return result.affectedRows;
  },
};

module.exports = User;
