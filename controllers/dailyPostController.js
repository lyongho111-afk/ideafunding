const asyncHandler = require("express-async-handler");
const DailyPost = require("../models/dailyPostModel");
const parseId = (value) => (/^[1-9]\d*$/.test(String(value)) ? Number(value) : null);

const feed = asyncHandler((req, res) => {
  const posts = DailyPost.list(req.user?._id || 0).map((post) => ({
    ...post,
    comments: DailyPost.comments(post.id),
  }));
  return res.render("daily-feed", { posts });
});

const createPost = asyncHandler((req, res) => {
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  if (!content || content.length > 500) return res.status(400).send("일상 글은 1~500자로 입력해 주세요.");
  DailyPost.create(req.user._id, content);
  return res.redirect("/ideas/feed");
});

const toggleLike = asyncHandler((req, res) => {
  const postId = parseId(req.params.postId);
  if (!postId || !DailyPost.exists(postId)) return res.status(404).send("게시물을 찾을 수 없습니다.");
  DailyPost.toggleLike(postId, req.user._id);
  return res.redirect("/ideas/feed");
});

const addComment = asyncHandler((req, res) => {
  const postId = parseId(req.params.postId);
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  if (!postId || !DailyPost.exists(postId)) return res.status(404).send("게시물을 찾을 수 없습니다.");
  if (!content || content.length > 300) return res.status(400).send("댓글은 1~300자로 입력해 주세요.");
  DailyPost.addComment(postId, req.user._id, content);
  return res.redirect("/ideas/feed");
});

module.exports = { feed, createPost, toggleLike, addComment };
