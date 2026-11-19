const database = require("../config/dbConnect")();

const DailyPost = {
  friends(userId) {
    return database.prepare(`
      SELECT u.id, u.username, u.name, u.account_type
      FROM friendships f JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = ?
      ORDER BY COALESCE(NULLIF(u.name, ''), u.username) COLLATE NOCASE
    `).all(userId);
  },
  searchUsers(query, userId) {
    const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    return database.prepare(`
      SELECT u.id, u.username, COALESCE(NULLIF(u.name, ''), u.username) AS display_name,
        u.account_type,
        EXISTS(SELECT 1 FROM friendships f WHERE f.user_id = ? AND f.friend_id = u.id) AS is_friend
      FROM users u
      WHERE u.id != ? AND (u.username LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\')
      ORDER BY is_friend DESC, display_name COLLATE NOCASE
      LIMIT 20
    `).all(userId, userId, pattern, pattern);
  },
  listFeed(viewerId, friends) {
    const friendIds = friends.map((friend) => Number(friend.id));
    const where = friendIds.length
      ? `p.owner_id IN (${[...friendIds, viewerId].map(() => "?").join(",")})`
      : "date(p.created_at, '+9 hours') = date('now', '+9 hours')";
    const ownerIds = friendIds.length ? [...friendIds, viewerId] : [];
    return database.prepare(`
      SELECT p.id, p.owner_id, p.content, p.created_at, u.username,
        COALESCE(NULLIF(u.name, ''), u.username) AS author_name,
        (SELECT COUNT(*) FROM daily_post_likes l WHERE l.post_id = p.id) AS like_count,
        (SELECT COUNT(*) FROM daily_post_comments c WHERE c.post_id = p.id) AS comment_count,
        EXISTS(SELECT 1 FROM daily_post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked
      FROM daily_posts p JOIN users u ON u.id = p.owner_id
      WHERE ${where}
      ORDER BY p.created_at DESC, p.id DESC LIMIT 50
    `).all(viewerId, ...ownerIds);
  },
  images(postId) {
    return database.prepare("SELECT id, data_url FROM daily_post_images WHERE post_id = ? ORDER BY id").all(postId);
  },
  comments(postId) {
    return database.prepare(`
      SELECT c.id, c.content, c.created_at, COALESCE(NULLIF(u.name, ''), u.username) AS author_name
      FROM daily_post_comments c JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ? ORDER BY c.created_at, c.id
    `).all(postId);
  },
  create(ownerId, content, images) {
    return database.transaction(() => {
      const result = database.prepare("INSERT INTO daily_posts (owner_id, content) VALUES (?, ?)")
        .run(ownerId, content);
      const insertImage = database.prepare("INSERT INTO daily_post_images (post_id, data_url) VALUES (?, ?)");
      images.forEach((image) => insertImage.run(result.lastInsertRowid, image));
      return result.lastInsertRowid;
    })();
  },
  addFriend(userId, friendId) {
    return database.transaction(() => {
      const insert = database.prepare("INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)");
      const first = insert.run(userId, friendId).changes;
      insert.run(friendId, userId);
      return first;
    })();
  },
  removeFriend(userId, friendId) {
    return database.transaction(() => {
      const remove = database.prepare("DELETE FROM friendships WHERE user_id = ? AND friend_id = ?");
      remove.run(userId, friendId);
      remove.run(friendId, userId);
    })();
  },
  isFriend(userId, friendId) {
    return Boolean(database.prepare("SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?").get(userId, friendId));
  },
  toggleLike(postId, userId) {
    return database.transaction(() => {
      const existing = database.prepare("SELECT 1 FROM daily_post_likes WHERE post_id = ? AND user_id = ?").get(postId, userId);
      if (existing) {
        database.prepare("DELETE FROM daily_post_likes WHERE post_id = ? AND user_id = ?").run(postId, userId);
        return false;
      }
      database.prepare("INSERT INTO daily_post_likes (post_id, user_id) VALUES (?, ?)").run(postId, userId);
      return true;
    })();
  },
  addComment(postId, userId, content) {
    return database.prepare("INSERT INTO daily_post_comments (post_id, user_id, content) VALUES (?, ?, ?)")
      .run(postId, userId, content);
  },
  exists(postId) {
    return Boolean(database.prepare("SELECT 1 FROM daily_posts WHERE id = ?").get(postId));
  },
  existsUser(userId) {
    return Boolean(database.prepare("SELECT 1 FROM users WHERE id = ?").get(userId));
  },
};

module.exports = DailyPost;
