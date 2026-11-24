const asyncHandler = require("express-async-handler");
const DailyPost = require("../models/dailyPostModel");
const parseId = (value) => (/^[1-9]\d*$/.test(String(value)) ? Number(value) : null);
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 750 * 1024;
const imageDataPattern = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

const isValidImage = (dataUrl) => {
  if (typeof dataUrl !== "string") return false;
  const match = imageDataPattern.exec(dataUrl);
  if (!match) return false;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString("base64") !== match[2]) return false;
  if (match[1] === "jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (match[1] === "png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
};

const feed = asyncHandler(async (req, res) => {
  const viewerId = req.user?._id || 0;
  const friends = req.user ? await DailyPost.friends(viewerId) : [];
  const searchQuery = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 40) : "";
  const people = req.user && searchQuery.length >= 2 ? await DailyPost.searchUsers(searchQuery, viewerId) : [];
  const friendIds = new Set(friends.map((friend) => friend.id));
  const feedPosts = await DailyPost.listFeed(viewerId, friends);
  const posts = await Promise.all(feedPosts.map(async (post) => ({
    ...post,
    images: await DailyPost.images(post.id),
    comments: await DailyPost.comments(post.id),
    is_friend: friendIds.has(post.owner_id),
  })));
  return res.render("daily-feed", { posts, friends, people, searchQuery });
});

const createPost = asyncHandler(async (req, res) => {
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  const images = req.body.images === undefined ? [] : req.body.images;
  if (content.length > 500 || !Array.isArray(images) || images.length > MAX_IMAGES ||
      images.some((image) => !isValidImage(image)) || (!content && !images.length)) {
    return res.status(400).send("글은 500자 이내로 작성하고, 사진은 최대 4장까지 올릴 수 있습니다. 글 또는 사진을 하나 이상 입력해 주세요.");
  }
  await DailyPost.create(req.user._id, content, images);
  return res.redirect("/ideas/feed");
});

const toggleLike = asyncHandler(async (req, res) => {
  const postId = parseId(req.params.postId);
  if (!postId || !await DailyPost.exists(postId)) return res.status(404).send("게시물을 찾을 수 없습니다.");
  await DailyPost.toggleLike(postId, req.user._id);
  return res.redirect("/ideas/feed");
});

const addComment = asyncHandler(async (req, res) => {
  const postId = parseId(req.params.postId);
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  if (!postId || !await DailyPost.exists(postId)) return res.status(404).send("게시물을 찾을 수 없습니다.");
  if (!content || content.length > 300) return res.status(400).send("댓글은 1~300자로 입력해 주세요.");
  await DailyPost.addComment(postId, req.user._id, content);
  return res.redirect("/ideas/feed");
});

const addFriend = asyncHandler(async (req, res) => {
  const friendId = parseId(req.params.friendId);
  if (!friendId || friendId === req.user._id || !await DailyPost.existsUser(friendId)) {
    return res.status(404).send("친구로 등록할 사용자를 찾을 수 없습니다.");
  }
  await DailyPost.addFriend(req.user._id, friendId);
  return res.redirect("/ideas/feed");
});

const removeFriend = asyncHandler(async (req, res) => {
  const friendId = parseId(req.params.friendId);
  if (!friendId || friendId === req.user._id) return res.status(400).send("친구 정보를 확인해 주세요.");
  await DailyPost.removeFriend(req.user._id, friendId);
  return res.redirect("/ideas/feed");
});

module.exports = { feed, createPost, toggleLike, addComment, addFriend, removeFriend };
