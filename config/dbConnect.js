// Node.js 내장 파일 시스템 모듈을 불러옴 (파일/디렉터리 생성, 확인 등에 사용)
const fs = require("node:fs");
// Node.js 내장 경로 모듈을 불러옴 (OS에 맞는 경로 문자열을 만들어 줌)
const path = require("node:path");
// better-sqlite3 패키지를 불러옴 (동기 방식으로 동작하는 SQLite 드라이버)
const Database = require("better-sqlite3");

// 현재 파일(__dirname) 기준으로 "data" 폴더 경로를 생성
const dataDirectory = path.join(__dirname, "data");
// data 폴더를 생성 (이미 존재해도 에러가 나지 않도록 recursive: true 옵션 사용)
fs.mkdirSync(dataDirectory, { recursive: true });

// 기존 앱 데이터가 저장된 SQLite 파일을 열거나 없으면 새로 생성
const database = new Database(path.join(dataDirectory, "contacts.sqlite"));
// SQLite의 외래 키(FOREIGN KEY) 제약 조건을 활성화 (기본값은 꺼져 있음)
database.pragma("foreign_keys = ON");
// 아래 SQL 문들을 한 번에 실행 (테이블이 없을 경우에만 생성)
database.exec(`
  -- users 테이블이 없으면 생성
  CREATE TABLE IF NOT EXISTS users (
    -- id: 자동 증가하는 기본 키
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- username: 사용자 이름, NULL 불가 + 중복 불가(UNIQUE)
    username TEXT NOT NULL UNIQUE,
    -- password: 비밀번호 (실무에서는 반드시 해시해서 저장해야 함)
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    publicKey TEXT,
    name TEXT,
    email TEXT,
    phone TEXT,
    -- createdAt: 계정 생성 시각, 기본값은 현재 UTC 시간 문자열
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    summary TEXT NOT NULL,
    funding_goal INTEGER NOT NULL,
    encrypted_details TEXT NOT NULL,
    wrapped_key TEXT NOT NULL,
    review_preview TEXT,
    review_wrapped_key TEXT,
    storage_mode TEXT NOT NULL DEFAULT 'funding' CHECK (storage_mode IN ('funding', 'private')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS pledges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    backer_id INTEGER NOT NULL REFERENCES users(id),
    amount INTEGER NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'released', 'refunded')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (idea_id, backer_id)
  );
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    asker_id INTEGER NOT NULL REFERENCES users(id),
    question TEXT NOT NULL,
    answer TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    answered_at TEXT
  );
  CREATE TABLE IF NOT EXISTS disclosures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    backer_id INTEGER NOT NULL REFERENCES users(id),
    encrypted_details TEXT NOT NULL,
    wrapped_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (idea_id, backer_id)
  );
  CREATE TABLE IF NOT EXISTS oauth_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL CHECK (provider IN ('google', 'kakao')),
    subject TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (provider, subject),
    UNIQUE (provider, user_id)
  );
  CREATE TABLE IF NOT EXISTS daily_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS daily_post_likes (
    post_id INTEGER NOT NULL REFERENCES daily_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (post_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS daily_post_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES daily_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const userColumns = database.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
if (!userColumns.includes("role")) {
  database.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
}
if (!userColumns.includes("publicKey")) {
  database.exec("ALTER TABLE users ADD COLUMN publicKey TEXT");
}
for (const column of ["name", "email", "phone"]) {
  if (!userColumns.includes(column)) database.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
}
const ideaColumns = database.prepare("PRAGMA table_info(ideas)").all().map((column) => column.name);
if (!ideaColumns.includes("review_preview")) {
  database.exec("ALTER TABLE ideas ADD COLUMN review_preview TEXT");
}
if (!ideaColumns.includes("review_wrapped_key")) {
  database.exec("ALTER TABLE ideas ADD COLUMN review_wrapped_key TEXT");
}
if (!ideaColumns.includes("storage_mode")) {
  database.exec("ALTER TABLE ideas ADD COLUMN storage_mode TEXT NOT NULL DEFAULT 'funding'");
}
database.exec("CREATE UNIQUE INDEX IF NOT EXISTS one_admin_account ON users(role) WHERE role = 'admin'");

// 이 파일을 require 했을 때 DB 연결 객체를 반환하는 함수를 내보냄
// (다른 파일에서 const getDb = require("./db"); const db = getDb(); 형태로 사용)
module.exports = () => database;