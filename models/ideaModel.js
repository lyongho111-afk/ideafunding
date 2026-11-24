const database = require("../config/dbConnect")();

const Idea = {
  async listPublic() {
    const [rows] = await database.execute(`
      SELECT i.id, i.title, i.category, i.summary, i.funding_goal,
        DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        COALESCE(NULLIF(u.name, ''), u.username) AS owner_name,
        COALESCE((SELECT SUM(p.amount) FROM pledges p WHERE p.idea_id = i.id AND p.status = 'held'), 0) AS pledged
      FROM ideas i JOIN users u ON u.id = i.owner_id
      WHERE i.status = 'approved' AND i.storage_mode = 'funding'
      ORDER BY i.created_at DESC
    `);
    return rows;
  },
  async findById(id) {
    const [rows] = await database.execute(`
      SELECT i.*, COALESCE(NULLIF(u.name, ''), u.username) AS owner_name, u.publicKey AS owner_public_key
      FROM ideas i JOIN users u ON u.id = i.owner_id WHERE i.id = ?
    `, [Number(id)]);
    return rows[0] || null;
  },
  async create({ ownerId, title, category, summary, fundingGoal, encryptedDetails, wrappedKey, reviewPreview, reviewWrappedKey, storageMode }) {
    const [result] = await database.execute(`
      INSERT INTO ideas (owner_id, title, category, summary, funding_goal, encrypted_details, wrapped_key, review_preview, review_wrapped_key, storage_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [ownerId, title, category, summary, fundingGoal, encryptedDetails, wrappedKey, reviewPreview, reviewWrappedKey, storageMode]);
    return this.findById(result.insertId);
  },
  async forOwner(ownerId) {
    const [rows] = await database.execute(`
      SELECT i.*,
        COALESCE((SELECT SUM(p.amount) FROM pledges p WHERE p.idea_id = i.id AND p.status = 'held'), 0) AS pledged
      FROM ideas i WHERE i.owner_id = ? ORDER BY i.created_at DESC
    `, [ownerId]);
    return rows;
  },
  async pending() {
    const [rows] = await database.execute(`
      SELECT i.id, i.title, i.category, i.summary, i.funding_goal,
        DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        i.review_preview, i.review_wrapped_key, COALESCE(NULLIF(u.name, ''), u.username) AS owner_name
      FROM ideas i JOIN users u ON u.id = i.owner_id
      WHERE i.status = 'pending' AND i.storage_mode = 'funding' ORDER BY i.created_at
    `);
    return rows;
  },
  async review(id, status, fundingGoal) {
    const [result] = await database.execute(
      "UPDATE ideas SET status = ?, funding_goal = ? WHERE id = ? AND status = 'pending'",
      [status, fundingGoal, Number(id)],
    );
    return result.affectedRows;
  },
  async getPledge(ideaId, backerId) {
    const [rows] = await database.execute(
      "SELECT * FROM pledges WHERE idea_id = ? AND backer_id = ?",
      [ideaId, backerId],
    );
    return rows[0] || null;
  },
  async createPledge(ideaId, backerId, amount) {
    return database.execute(
      "INSERT INTO pledges (idea_id, backer_id, amount) VALUES (?, ?, ?)",
      [ideaId, backerId, amount],
    );
  },
  async backers(ideaId) {
    const [rows] = await database.execute(`
      SELECT p.id AS pledge_id, p.amount, p.status, u.id AS backer_id, u.username, u.publicKey
      FROM pledges p JOIN users u ON u.id = p.backer_id
      WHERE p.idea_id = ? AND p.status = 'held' ORDER BY p.created_at
    `, [ideaId]);
    return rows;
  },
  async hasHeldPledge(ideaId, userId) {
    return (await this.getPledge(ideaId, userId))?.status === "held";
  },
  async addQuestion(ideaId, askerId, question) {
    return database.execute(
      "INSERT INTO questions (idea_id, asker_id, question) VALUES (?, ?, ?)",
      [ideaId, askerId, question],
    );
  },
  async questions(ideaId) {
    const [rows] = await database.execute(`
      SELECT q.id, q.idea_id, q.asker_id, q.question, q.answer,
        DATE_FORMAT(q.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        q.answered_at, u.username AS asker_name FROM questions q
      JOIN users u ON u.id = q.asker_id WHERE q.idea_id = ? ORDER BY q.created_at
    `, [ideaId]);
    return rows;
  },
  async answerQuestion(questionId, ownerId, answer) {
    const [result] = await database.execute(`
      UPDATE questions SET answer = ?, answered_at = CURRENT_TIMESTAMP
      WHERE id = ? AND answer IS NULL AND idea_id IN (SELECT id FROM ideas WHERE owner_id = ?)
    `, [answer, Number(questionId), ownerId]);
    return result.affectedRows;
  },
  async saveDisclosure(ideaId, backerId, encryptedDetails, wrappedKey) {
    return database.execute(`
      INSERT INTO disclosures (idea_id, backer_id, encrypted_details, wrapped_key)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE encrypted_details = VALUES(encrypted_details), wrapped_key = VALUES(wrapped_key)
    `, [ideaId, backerId, encryptedDetails, wrappedKey]);
  },
  async getDisclosure(ideaId, backerId) {
    const [rows] = await database.execute(
      "SELECT encrypted_details, wrapped_key FROM disclosures WHERE idea_id = ? AND backer_id = ?",
      [ideaId, backerId],
    );
    return rows[0] || null;
  },
};

module.exports = Idea;
