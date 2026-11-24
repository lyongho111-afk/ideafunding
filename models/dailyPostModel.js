const database = require("../config/dbConnect")();
const withTransaction = require("../config/dbConnect").withTransaction;

const DailyPost = {
  async friends(userId) {
    const [rows] = await database.execute(`
      SELECT u.id, u.username, u.name, u.account_type
      FROM friendships f JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = ?
      ORDER BY LOWER(COALESCE(NULLIF(u.name, ''), u.username))
    `, [userId]);
    return rows;
  },
  async searchUsers(query, userId) {
    const pattern = `%${query.replace(/[!%_]/g, "!$&")}%`;
    const [rows] = await database.execute(`
      SELECT u.id, u.username, COALESCE(NULLIF(u.name, ''), u.username) AS display_name,
        u.account_type,
        EXISTS(SELECT 1 FROM friendships f WHERE f.user_id = ? AND f.friend_id = u.id) AS is_friend
      FROM users u
      WHERE u.id != ? AND (LOWER(u.username) LIKE LOWER(?) ESCAPE '!' OR LOWER(u.name) LIKE LOWER(?) ESCAPE '!')
      ORDER BY is_friend DESC, LOWER(COALESCE(NULLIF(u.name, ''), u.username))
      LIMIT 20
    `, [userId, userId, pattern, pattern]);
    return rows;
  },
  async listFeed(viewerId, friends) {
    const friendIds = friends.map((friend) => Number(friend.id));
    const where = friendIds.length
      ? `p.owner_id IN (${[...friendIds, viewerId].map(() => "?").join(",")})`
      : "DATE(DATE_ADD(p.created_at, INTERVAL 9 HOUR)) = DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 9 HOUR))";
    const ownerIds = friendIds.length ? [...friendIds, viewerId] : [];
    const [rows] = await database.execute(`
      SELECT p.id, p.owner_id, p.content,
        DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, u.username,
        COALESCE(NULLIF(u.name, ''), u.username) AS author_name,
        (SELECT COUNT(*) FROM daily_post_likes l WHERE l.post_id = p.id) AS like_count,
        (SELECT COUNT(*) FROM daily_post_comments c WHERE c.post_id = p.id) AS comment_count,
        EXISTS(SELECT 1 FROM daily_post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked
      FROM daily_posts p JOIN users u ON u.id = p.owner_id
      WHERE ${where}
      ORDER BY p.created_at DESC, p.id DESC LIMIT 50
    `, [viewerId, ...ownerIds]);
    return rows;
  },
  async images(postId) {
    const [rows] = await database.execute(
      "SELECT id, data_url FROM daily_post_images WHERE post_id = ? ORDER BY id",
      [postId],
    );
    return rows;
  },
  async comments(postId) {
    const [rows] = await database.execute(`
      SELECT c.id, c.content, DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        COALESCE(NULLIF(u.name, ''), u.username) AS author_name
      FROM daily_post_comments c JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ? ORDER BY c.created_at, c.id
    `, [postId]);
    return rows;
  },
  async create(ownerId, content, images) {
    return withTransaction(async (connection) => {
      const [result] = await connection.execute(
        "INSERT INTO daily_posts (owner_id, content) VALUES (?, ?)",
        [ownerId, content],
      );
      for (const image of images) {
        await connection.execute(
          "INSERT INTO daily_post_images (post_id, data_url) VALUES (?, ?)",
          [result.insertId, image],
        );
      }
      return result.insertId;
    });
  },
  async addFriend(userId, friendId) {
    return withTransaction(async (connection) => {
      const [result] = await connection.execute(
        "INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)",
        [userId, friendId],
      );
      await connection.execute(
        "INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)",
        [friendId, userId],
      );
      return result.affectedRows;
    });
  },
  async removeFriend(userId, friendId) {
    return withTransaction(async (connection) => {
      await connection.execute(
        "DELETE FROM friendships WHERE user_id = ? AND friend_id = ?",
        [userId, friendId],
      );
      await connection.execute(
        "DELETE FROM friendships WHERE user_id = ? AND friend_id = ?",
        [friendId, userId],
      );
    });
  },
  async isFriend(userId, friendId) {
    const [rows] = await database.execute(
      "SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?",
      [userId, friendId],
    );
    return rows.length > 0;
  },
  async toggleLike(postId, userId) {
    return withTransaction(async (connection) => {
      const [insert] = await connection.execute(
        "INSERT IGNORE INTO daily_post_likes (post_id, user_id) VALUES (?, ?)",
        [postId, userId],
      );
      if (insert.affectedRows) return true;
      await connection.execute(
        "DELETE FROM daily_post_likes WHERE post_id = ? AND user_id = ?",
        [postId, userId],
      );
      return false;
    });
  },
  async addComment(postId, userId, content) {
    return database.execute(
      "INSERT INTO daily_post_comments (post_id, user_id, content) VALUES (?, ?, ?)",
      [postId, userId, content],
    );
  },
  async exists(postId) {
    const [rows] = await database.execute(
      "SELECT 1 FROM daily_posts WHERE id = ?",
      [postId],
    );
    return rows.length > 0;
  },
  async existsUser(userId) {
    const [rows] = await database.execute(
      "SELECT 1 FROM users WHERE id = ?",
      [userId],
    );
    return rows.length > 0;
  },
};

module.exports = DailyPost;
