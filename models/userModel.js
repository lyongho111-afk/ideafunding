// 데이터베이스 연결 함수를 불러옵니다.
const getDatabase = require("../config/dbConnect");
// 데이터베이스 연결 객체를 가져옵니다.
const database = getDatabase();

// SQLite 쿼리를 이용한 사용자 데이터 접근 메서드들을 정의합니다.
const User = {
  // 필수 항목을 확인한 뒤 새 사용자를 데이터베이스에 저장합니다.
  create({ username, password, role = "user", publicKey, name, email, phone }) {
    // 아이디 또는 비밀번호가 비어 있으면 저장을 거부합니다.
    if (!username || !password) {
      throw new Error("아이디와 비밀번호를 입력해 주세요.");
    }

    // 사용자 행을 추가하고 생성된 행의 ID를 결과로 받습니다.
    const result = database
      // 아이디와 비밀번호를 users 테이블에 저장하는 SQL 문을 준비합니다.
      .prepare("INSERT INTO users (username, password, role, publicKey, name, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)")
      // 사용자 입력을 SQL 매개변수로 안전하게 전달합니다.
      .run(username, password, role, publicKey || null, name || null, email || null, phone || null);
    // 방금 생성된 사용자를 ID로 다시 조회해 반환합니다.
    return this.findById(result.lastInsertRowid);
  },

  // 아이디로 사용자 한 명을 조회합니다.
  findOne({ username }) {
    // 아이디가 일치하는 사용자 정보를 조회하고, 결과가 없으면 null을 반환합니다.
    return database
      // 데이터베이스 id를 모델의 _id 필드로 반환하도록 SELECT 문을 준비합니다.
      .prepare("SELECT id AS _id, username, password, role, publicKey, name, email, phone FROM users WHERE username = ?")
      // 전달받은 아이디로 조회를 실행합니다.
      .get(username) || null;
  },

  // 사용자 ID로 사용자 한 명을 조회합니다.
  findById(id) {
    // 데이터베이스 id를 모델의 _id 필드로 반환하도록 조회하고, 결과가 없으면 null을 반환합니다.
    return database
      // 전달된 ID와 일치하는 사용자를 찾는 SQL 문을 준비합니다.
      .prepare("SELECT id AS _id, username, role, publicKey, name, email, phone FROM users WHERE id = ?")
      // ID를 숫자로 변환해 조회를 실행합니다.
      .get(Number(id)) || null;
  },

  updatePublicKeyIfUninitialized(id, publicKey) {
    return database
      .prepare("UPDATE users SET publicKey = ? WHERE id = ? AND (publicKey IS NULL OR (role = 'admin' AND publicKey = 'admin-no-encryption'))")
      .run(publicKey, Number(id)).changes;
  },

  findByOAuth(provider, subject) {
    return database.prepare(`
      SELECT u.id AS _id, u.username, u.role, u.publicKey, u.name, u.email, u.phone
      FROM users u JOIN oauth_accounts o ON o.user_id = u.id
      WHERE o.provider = ? AND o.subject = ?
    `).get(provider, subject) || null;
  },

  findAdmin() {
    return database.prepare(`
      SELECT id AS _id, username, publicKey FROM users WHERE role = 'admin' LIMIT 1
    `).get() || null;
  },

  createOAuthAccount({ provider, subject, username, password, name, email, phone }) {
    const create = database.transaction(() => {
      const result = database.prepare(
        "INSERT INTO users (username, password, role, name, email, phone) VALUES (?, ?, 'user', ?, ?, ?)"
      ).run(username, password, name || null, email || null, phone || null);
      database.prepare(
        "INSERT INTO oauth_accounts (provider, subject, user_id) VALUES (?, ?, ?)"
      ).run(provider, subject, result.lastInsertRowid);
      return this.findById(result.lastInsertRowid);
    });
    return create();
  },
  updateOAuthProfile(id, { name, email, phone }) {
    return database.prepare(`
      UPDATE users SET
        name = COALESCE(NULLIF(?, ''), name),
        email = COALESCE(NULLIF(?, ''), email),
        phone = COALESCE(NULLIF(?, ''), phone)
      WHERE id = ?
    `).run(name || "", email || "", phone || "", Number(id)).changes;
  },
  updateProfile(id, { name, email, phone }) {
    return database.prepare("UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?")
      .run(name, email, phone, Number(id)).changes;
  },
};

// 다른 모듈에서 사용자 데이터 접근 메서드를 사용할 수 있도록 내보냅니다.
module.exports = User;
