const express = require("express");
const router = express.Router();
const oauth = require("../controllers/oauthController");

router.get("/google", oauth.startGoogle);
router.get("/google/callback", oauth.googleCallback);
router.get("/kakao", oauth.startKakao);
router.get("/kakao/callback", oauth.kakaoCallback);

module.exports = router;
