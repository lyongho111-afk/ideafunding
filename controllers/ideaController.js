const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");
const path = require("node:path");
const Idea = require("../models/ideaModel");
const User = require("../models/userModel");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const jwtSecret = process.env.JWT_SECRET;
const parseId = (value) => (/^[1-9]\d*$/.test(String(value)) ? Number(value) : null);

const attachCurrentUser = asyncHandler(async (req, res, next) => {
  const token = req.cookies.token;
  if (token) {
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (error) {
      res.clearCookie("token");
    }
    if (decoded) req.user = await User.findById(decoded.id);
  }
  res.locals.currentUser = req.user || null;
  next();
});

const listIdeas = asyncHandler(async (req, res) => {
  res.render("ideas", { ideas: await Idea.listPublic() });
});

const newIdeaPage = asyncHandler(async (req, res) => {
  if (req.user.account_type !== "local") return res.status(403).send("아이디어 저장과 펀딩 제안은 아이디·비밀번호 계정만 이용할 수 있습니다.");
  if (!req.user.publicKey || req.user.publicKey === "admin-no-encryption") return res.redirect("/ideas/key-setup");
  const admin = await User.findAdmin();
  return res.render("idea-new", {
    publicKey: req.user.publicKey,
    adminPublicKey: admin?.publicKey || null,
    adminConfigured: Boolean(admin?.publicKey && admin.publicKey !== "admin-no-encryption"),
  });
});

const keySetupPage = asyncHandler((req, res) => {
  return res.render("key-setup");
});

const saveAccountKey = asyncHandler(async (req, res) => {
  const { publicKey } = req.body;
  let parsedKey;
  try {
    parsedKey = JSON.parse(publicKey);
  } catch (error) {
    parsedKey = null;
  }
  if (!parsedKey || parsedKey.kty !== "RSA" || parsedKey.alg !== "RSA-OAEP-256" || publicKey.length > 5000) {
    return res.status(400).send("유효한 RSA 공개키가 아닙니다.");
  }
  if (!await User.updatePublicKeyIfUninitialized(req.user._id, publicKey)) {
    return res.status(409).send("이미 암호화 키가 등록되어 있습니다.");
  }
  return res.status(201).json({ message: "암호화 키가 등록되었습니다." });
});

const createIdea = asyncHandler(async (req, res) => {
  if (req.user.account_type !== "local") return res.status(403).send("아이디어 저장과 펀딩 제안은 아이디·비밀번호 계정만 이용할 수 있습니다.");
  const { title, category, summary, fundingGoal, encryptedDetails, wrappedKey, reviewPreview, reviewWrappedKey } = req.body;
  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  const normalizedCategory = typeof category === "string" ? category.trim() : "";
  const normalizedSummary = typeof summary === "string" ? summary.trim() : "";
  if (!req.user.publicKey || req.user.publicKey === "admin-no-encryption") return res.status(409).send("아이디어 등록 전에 암호화 키를 설정해 주세요.");
  const admin = await User.findAdmin();
  const storageMode = req.body.storageMode;
  if (!["funding", "private"].includes(storageMode)) return res.status(400).send("저장 방식을 선택해 주세요.");
  if (storageMode === "funding" && (!admin?.publicKey || admin.publicKey === "admin-no-encryption")) {
    return res.status(503).send("펀딩 공개를 위해 관리자 계정과 검수용 암호화 키를 먼저 설정해 주세요.");
  }
  const goal = Number(fundingGoal);
  if (!normalizedTitle || normalizedTitle.length > 100 || !normalizedCategory || normalizedCategory.length > 40 ||
      (storageMode === "funding" && (!normalizedSummary || normalizedSummary.length > 600 || !Number.isSafeInteger(goal) || goal < 1000 || goal > 1000000000)) ||
      !encryptedDetails || encryptedDetails.length > 90000 || !wrappedKey || wrappedKey.length > 2000 ||
      (storageMode === "funding" && (!reviewPreview || reviewPreview.length > 50000 || !reviewWrappedKey || reviewWrappedKey.length > 2000))) {
    return res.status(400).send("입력 항목과 암호화된 상세 내용을 확인해 주세요.");
  }
  await Idea.create({
    ownerId: req.user._id,
    title: normalizedTitle,
    category: normalizedCategory,
    summary: storageMode === "funding" ? normalizedSummary : "",
    fundingGoal: storageMode === "funding" ? goal : 0,
    encryptedDetails,
    wrappedKey,
    reviewPreview: storageMode === "funding" ? reviewPreview : null,
    reviewWrappedKey: storageMode === "funding" ? reviewWrappedKey : null,
    storageMode,
  });
  return res.status(201).json({
    message: storageMode === "funding" ? "아이디어가 검수 대기 목록에 등록되었습니다." : "아이디어를 비공개로 저장했습니다.",
  });
});

const myIdeas = asyncHandler(async (req, res) => {
  res.render("my-ideas", { ideas: await Idea.forOwner(req.user._id) });
});

const ideaPage = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const idea = id && await Idea.findById(id);
  if (!idea || (idea.storage_mode !== "funding" && idea.owner_id !== req.user?._id) ||
      (idea.storage_mode === "funding" && idea.status !== "approved" && idea.owner_id !== req.user?._id)) {
    return res.status(404).send("아이디어를 찾을 수 없습니다.");
  }
  const owner = req.user?._id === idea.owner_id;
  const pledged = req.user ? await Idea.hasHeldPledge(idea.id, req.user._id) : false;
  const disclosure = pledged && !owner ? await Idea.getDisclosure(idea.id, req.user._id) : null;
  return res.render("idea-detail", {
    idea,
    owner,
    pledged,
    disclosure,
    backers: owner ? await Idea.backers(idea.id) : [],
    questions: owner || pledged ? await Idea.questions(idea.id) : [],
  });
});

const pledge = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const idea = id && await Idea.findById(id);
  const amount = Number(req.body.amount);
  if (!idea || idea.status !== "approved") return res.status(404).send("공개된 아이디어를 찾을 수 없습니다.");
  if (idea.owner_id === req.user._id) return res.status(400).send("본인의 아이디어에는 후원할 수 없습니다.");
  if (!req.user.publicKey) return res.status(409).send("에스크로 예약 전에 암호화 키를 설정해 주세요.");
  const minimumPledge = Math.ceil(idea.funding_goal / 20);
  if (!Number.isSafeInteger(amount) || amount < minimumPledge || amount > 1000000000) {
    return res.status(400).send("목표 모금액의 5% 이상, 10억원 이하 금액을 입력해 주세요.");
  }
  try {
    await Idea.createPledge(idea.id, req.user._id, amount);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).send("이미 에스크로 예약이 있습니다.");
    throw error;
  }
  return res.redirect(`/ideas/${idea.id}`);
});

const askQuestion = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const idea = id && await Idea.findById(id);
  const question = req.body.question?.trim();
  if (!idea || idea.status !== "approved" || !await Idea.hasHeldPledge(idea.id, req.user._id)) {
    return res.status(403).send("에스크로 예약이 확인된 후 질문할 수 있습니다.");
  }
  if (!question || question.length > 1000) return res.status(400).send("질문은 1~1,000자로 입력해 주세요.");
  await Idea.addQuestion(idea.id, req.user._id, question);
  return res.redirect(`/ideas/${idea.id}`);
});

const answerQuestion = asyncHandler(async (req, res) => {
  const ideaId = parseId(req.params.id);
  const questionId = parseId(req.params.questionId);
  const answer = req.body.answer?.trim();
  if (!ideaId || !questionId || !answer || answer.length > 2000) return res.status(400).send("답변을 확인해 주세요.");
  if (!await Idea.answerQuestion(questionId, req.user._id, answer)) return res.status(404).send("답변할 질문을 찾을 수 없습니다.");
  return res.redirect(`/ideas/${ideaId}`);
});

const disclose = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const backerId = parseId(req.params.backerId);
  const idea = id && await Idea.findById(id);
  const backer = backerId && (await Idea.backers(id)).find((item) => item.backer_id === backerId);
  const { encryptedDetails, wrappedKey } = req.body;
  if (!idea || idea.owner_id !== req.user._id) return res.status(404).send("아이디어를 찾을 수 없습니다.");
  if (!backer || !encryptedDetails || !wrappedKey) return res.status(400).send("에스크로 예약 또는 공개할 내용을 확인해 주세요.");
  await Idea.saveDisclosure(id, backerId, encryptedDetails, wrappedKey);
  return res.status(201).json({ message: "상세 내용을 암호화해 공개했습니다." });
});

const adminDashboard = asyncHandler(async (req, res) => {
  if (!req.user.publicKey || req.user.publicKey === "admin-no-encryption") return res.redirect("/ideas/key-setup");
  return res.render("admin", { ideas: await Idea.pending() });
});

const reviewIdea = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const { decision } = req.body;
  const idea = id && await Idea.findById(id);
  const goal = Number(req.body.fundingGoal);
  if (!idea || idea.status !== "pending") return res.status(404).send("검수 대기 중인 아이디어를 찾을 수 없습니다.");
  if (decision === "approved" && (!idea.review_preview || !idea.review_wrapped_key)) {
    return res.status(409).send("검수용 상세 미리보기가 없어 승인할 수 없습니다.");
  }
  if (decision === "approved" && req.body.previewViewed !== "true") {
    return res.status(400).send("상세 내용의 50% 미리보기를 확인한 뒤 승인해 주세요.");
  }
  if (!["approved", "rejected"].includes(decision) || !Number.isSafeInteger(goal) || goal < idea.funding_goal || goal > 1000000000) {
    return res.status(400).send("게시 결정 또는 상향된 모금 목표를 확인해 주세요.");
  }
  await Idea.review(id, decision, goal);
  return res.redirect("/ideas/admin");
});

module.exports = {
  attachCurrentUser, listIdeas, newIdeaPage, createIdea, myIdeas, ideaPage,
  keySetupPage, saveAccountKey, pledge, askQuestion, answerQuestion, disclose, adminDashboard, reviewIdea,
};
