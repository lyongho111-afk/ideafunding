const database = require("../config/dbConnect")();

const DailyPost = {
  list(viewerId) {
    return database.prepare(`
      SELECT p.id, p.content, p.created_at, u.username,
        COALESCE(NULLIF(u.name, ''), u.username) AS author_name,
        (SELECT COUNT(*) FROM daily_post_likes l WHERE l.post_id = p.id) AS like_count,
        (SELECT COUNT(*) FROM daily_post_comments c WHERE c.post_id = p.id) AS comment_count,
        EXISTS(SELECT 1 FROM daily_post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked
      FROM daily_posts p JOIN users u ON u.id = p.owner_id
      ORDER BY p.created_at DESC, p.id DESC LIMIT 50
    `).all(viewerId);
  },
  comments(postId) {
    return database.prepare(`
      SELECT c.id, c.content, c.created_at, COALESCE(NULLIF(u.name, ''), u.username) AS author_name
      FROM daily_post_comments c JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ? ORDER BY c.created_at, c.id
    `).all(postId);
  },
  create(ownerId, content) {
    return database.prepare("INSERT INTO daily_posts (owner_id, content) VALUES (?, ?)").run(ownerId, content);
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
};

module.exports = DailyPost;
