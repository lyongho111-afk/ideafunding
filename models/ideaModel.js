const database = require("../config/dbConnect")();

const Idea = {
  listPublic() {
    return database.prepare(`
      SELECT i.id, i.title, i.category, i.summary, i.funding_goal, i.created_at,
        u.username AS owner_name,
        COALESCE((SELECT SUM(p.amount) FROM pledges p WHERE p.idea_id = i.id AND p.status = 'held'), 0) AS pledged
      FROM ideas i JOIN users u ON u.id = i.owner_id
      WHERE i.status = 'approved'
      ORDER BY i.created_at DESC
    `).all();
  },
  findById(id) {
    return database.prepare(`
      SELECT i.*, u.username AS owner_name, u.publicKey AS owner_public_key
      FROM ideas i JOIN users u ON u.id = i.owner_id WHERE i.id = ?
    `).get(Number(id)) || null;
  },
  create({ ownerId, title, category, summary, fundingGoal, encryptedDetails, wrappedKey, reviewPreview, reviewWrappedKey }) {
    const result = database.prepare(`
      INSERT INTO ideas (owner_id, title, category, summary, funding_goal, encrypted_details, wrapped_key, review_preview, review_wrapped_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ownerId, title, category, summary, fundingGoal, encryptedDetails, wrappedKey, reviewPreview, reviewWrappedKey);
    return this.findById(result.lastInsertRowid);
  },
  forOwner(ownerId) {
    return database.prepare(`
      SELECT i.*,
        COALESCE((SELECT SUM(p.amount) FROM pledges p WHERE p.idea_id = i.id AND p.status = 'held'), 0) AS pledged
      FROM ideas i WHERE i.owner_id = ? ORDER BY i.created_at DESC
    `).all(ownerId);
  },
  pending() {
    return database.prepare(`
      SELECT i.id, i.title, i.category, i.summary, i.funding_goal, i.created_at,
        i.review_preview, i.review_wrapped_key, u.username AS owner_name
      FROM ideas i JOIN users u ON u.id = i.owner_id WHERE i.status = 'pending' ORDER BY i.created_at
    `).all();
  },
  review(id, status, fundingGoal) {
    return database.prepare(`
      UPDATE ideas SET status = ?, funding_goal = ?, updated_at = datetime('now') WHERE id = ? AND status = 'pending'
    `).run(status, fundingGoal, Number(id)).changes;
  },
  getPledge(ideaId, backerId) {
    return database.prepare("SELECT * FROM pledges WHERE idea_id = ? AND backer_id = ?").get(ideaId, backerId) || null;
  },
  createPledge(ideaId, backerId, amount) {
    return database.prepare("INSERT INTO pledges (idea_id, backer_id, amount) VALUES (?, ?, ?)").run(ideaId, backerId, amount);
  },
  backers(ideaId) {
    return database.prepare(`
      SELECT p.id AS pledge_id, p.amount, p.status, u.id AS backer_id, u.username, u.publicKey
      FROM pledges p JOIN users u ON u.id = p.backer_id
      WHERE p.idea_id = ? AND p.status = 'held' ORDER BY p.created_at
    `).all(ideaId);
  },
  hasHeldPledge(ideaId, userId) {
    return Boolean(this.getPledge(ideaId, userId)?.status === "held");
  },
  addQuestion(ideaId, askerId, question) {
    return database.prepare("INSERT INTO questions (idea_id, asker_id, question) VALUES (?, ?, ?)").run(ideaId, askerId, question);
  },
  questions(ideaId) {
    return database.prepare(`
      SELECT q.*, u.username AS asker_name FROM questions q
      JOIN users u ON u.id = q.asker_id WHERE q.idea_id = ? ORDER BY q.created_at
    `).all(ideaId);
  },
  answerQuestion(questionId, ownerId, answer) {
    return database.prepare(`
      UPDATE questions SET answer = ?, answered_at = datetime('now')
      WHERE id = ? AND answer IS NULL AND idea_id IN (SELECT id FROM ideas WHERE owner_id = ?)
    `).run(answer, Number(questionId), ownerId).changes;
  },
  saveDisclosure(ideaId, backerId, encryptedDetails, wrappedKey) {
    return database.prepare(`
      INSERT INTO disclosures (idea_id, backer_id, encrypted_details, wrapped_key)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(idea_id, backer_id) DO UPDATE SET encrypted_details = excluded.encrypted_details, wrapped_key = excluded.wrapped_key
    `).run(ideaId, backerId, encryptedDetails, wrappedKey);
  },
  getDisclosure(ideaId, backerId) {
    return database.prepare("SELECT encrypted_details, wrapped_key FROM disclosures WHERE idea_id = ? AND backer_id = ?").get(ideaId, backerId) || null;
  },
};

module.exports = Idea;
