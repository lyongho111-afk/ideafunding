const mysql = require("mysql2/promise");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const connectionUrl = process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL;
let pool;

if (connectionUrl) {
  const parsedUrl = new URL(connectionUrl);
  pool = mysql.createPool({
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port || 3306),
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    database: decodeURIComponent(parsedUrl.pathname.replace(/^\//, "")),
    timezone: "Z",
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    ssl: process.env.MYSQL_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });
} else if (
  (process.env.MYSQL_HOST || process.env.MYSQLHOST) &&
  (process.env.MYSQL_USER || process.env.MYSQLUSER) &&
  (process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE)
) {
  pool = mysql.createPool({
    host: process.env.MYSQL_HOST || process.env.MYSQLHOST,
    port: Number(process.env.MYSQL_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.MYSQL_USER || process.env.MYSQLUSER,
    password: process.env.MYSQL_PASSWORD || process.env.MYSQLPASSWORD || "",
    database: process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE,
    timezone: "Z",
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    ssl: process.env.MYSQL_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });
} else {
  throw new Error("MySQL 연결을 위해 MYSQL_URL 또는 MYSQL_HOST, MYSQL_USER, MYSQL_DATABASE 환경 변수를 설정해 주세요.");
}

const initializeDatabase = async () => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      account_type ENUM('local', 'kakao', 'google') NOT NULL DEFAULT 'local',
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      admin_guard TINYINT GENERATED ALWAYS AS (CASE WHEN role = 'admin' THEN 1 ELSE NULL END) STORED UNIQUE,
      publicKey TEXT,
      name VARCHAR(80),
      email VARCHAR(254),
      phone VARCHAR(20),
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS ideas (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_id INT UNSIGNED NOT NULL,
      title VARCHAR(100) NOT NULL,
      category VARCHAR(40) NOT NULL,
      summary VARCHAR(600) NOT NULL,
      funding_goal BIGINT UNSIGNED NOT NULL,
      encrypted_details MEDIUMTEXT NOT NULL,
      wrapped_key TEXT NOT NULL,
      review_preview MEDIUMTEXT,
      review_wrapped_key TEXT,
      storage_mode ENUM('funding', 'private') NOT NULL DEFAULT 'funding',
      status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX ideas_public_feed (status, storage_mode, created_at),
      INDEX ideas_owner (owner_id, created_at),
      CONSTRAINT ideas_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS pledges (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      idea_id INT UNSIGNED NOT NULL,
      backer_id INT UNSIGNED NOT NULL,
      amount BIGINT UNSIGNED NOT NULL,
      status ENUM('held', 'released', 'refunded') NOT NULL DEFAULT 'held',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY pledges_idea_backer (idea_id, backer_id),
      CONSTRAINT pledges_idea_fk FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
      CONSTRAINT pledges_backer_fk FOREIGN KEY (backer_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS questions (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      idea_id INT UNSIGNED NOT NULL,
      asker_id INT UNSIGNED NOT NULL,
      question TEXT NOT NULL,
      answer TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      answered_at TIMESTAMP NULL,
      INDEX questions_idea (idea_id, created_at),
      CONSTRAINT questions_idea_fk FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
      CONSTRAINT questions_asker_fk FOREIGN KEY (asker_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS disclosures (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      idea_id INT UNSIGNED NOT NULL,
      backer_id INT UNSIGNED NOT NULL,
      encrypted_details MEDIUMTEXT NOT NULL,
      wrapped_key TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY disclosures_idea_backer (idea_id, backer_id),
      CONSTRAINT disclosures_idea_fk FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
      CONSTRAINT disclosures_backer_fk FOREIGN KEY (backer_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS oauth_accounts (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      provider ENUM('google', 'kakao') NOT NULL,
      subject VARCHAR(255) NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY oauth_provider_subject (provider, subject),
      UNIQUE KEY oauth_provider_user (provider, user_id),
      CONSTRAINT oauth_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS daily_posts (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_id INT UNSIGNED NOT NULL,
      content VARCHAR(500) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX daily_posts_owner_date (owner_id, created_at),
      CONSTRAINT daily_posts_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS daily_post_images (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      post_id INT UNSIGNED NOT NULL,
      data_url MEDIUMTEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX daily_images_post (post_id, id),
      CONSTRAINT daily_images_post_fk FOREIGN KEY (post_id) REFERENCES daily_posts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS friendships (
      user_id INT UNSIGNED NOT NULL,
      friend_id INT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, friend_id),
      CONSTRAINT friendships_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT friendships_friend_fk FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS daily_post_likes (
      post_id INT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, user_id),
      CONSTRAINT daily_likes_post_fk FOREIGN KEY (post_id) REFERENCES daily_posts(id) ON DELETE CASCADE,
      CONSTRAINT daily_likes_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS daily_post_comments (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      post_id INT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      content VARCHAR(300) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX daily_comments_post (post_id, created_at),
      CONSTRAINT daily_comments_post_fk FOREIGN KEY (post_id) REFERENCES daily_posts(id) ON DELETE CASCADE,
      CONSTRAINT daily_comments_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];

  for (const statement of statements) await pool.query(statement);
};

const withTransaction = async (callback) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = () => pool;
module.exports.initializeDatabase = initializeDatabase;
module.exports.withTransaction = withTransaction;
