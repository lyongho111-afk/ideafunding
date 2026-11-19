// 비동기 라우트에서 발생한 오류를 Express 오류 처리기로 전달하는 도구를 불러옵니다.
const asyncHandler = require("express-async-handler");
// 사용자 데이터 조회와 등록을 담당하는 모델을 불러옵니다.
const User = require("../models/userModel");
// 비밀번호 해시 생성과 검증을 위한 bcrypt를 불러옵니다.
const bcrypt = require("bcrypt");
// 로그인 인증 토큰의 생성과 검증을 위한 JWT 라이브러리를 불러옵니다.
const jwt = require("jsonwebtoken");
// 환경 변수 파일의 경로를 구성하기 위해 Node.js 내장 경로 모듈을 불러옵니다.
const path = require("node:path");
// 프로젝트 루트의 .env 파일에서 환경 변수를 읽어옵니다.
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
// JWT 서명에 사용할 비밀 키를 환경 변수에서 가져옵니다.
const jwtSecret = process.env.JWT_SECRET;
// 비밀 키가 없으면 안전하지 않은 상태로 실행되지 않도록 오류를 발생시킵니다.
if (!jwtSecret) {
  // 설정에 필요한 환경 변수 이름과 위치를 안내합니다.
  throw new Error("JWT_SECRET을 sqlite/.env 또는 환경변수로 설정해 주세요.");
}

/**
 * 사용자 등록 기능을 처리합니다.
 */

//@desc Register Page
//@route GET /register
// 회원가입 화면을 보여주는 컨트롤러입니다.
const oauthProviders = () => ({
  google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  kakao: Boolean(process.env.KAKAO_CLIENT_ID && process.env.KAKAO_CLIENT_SECRET),
});

const getRegister = (req, res) => res.render("register", { oauthProviders: oauthProviders() });

// @desc Register user
// @route POST /register
// 회원가입 요청을 검증하고 사용자를 저장하는 컨트롤러입니다.
const registerUser = asyncHandler(async (req, res) => {
  // 요청 본문에서 아이디, 비밀번호, 비밀번호 확인 값을 가져옵니다.
  const { username, password, password2, publicKey, name, email, phone } = req.body;
  const normalizedUsername = typeof username === "string" ? username.trim() : "";
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const normalizedPhone = typeof phone === "string" ? phone.trim() : "";
  let parsedPublicKey;
  try {
    parsedPublicKey = JSON.parse(publicKey);
  } catch (error) {
    parsedPublicKey = null;
  }
  if (!normalizedUsername || normalizedUsername.length > 40 || !normalizedName || normalizedName.length > 80 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254 ||
      !/^[0-9+() -]{8,20}$/.test(normalizedPhone) ||
      !password || password.length < 10 || password.length > 128 ||
      password !== password2 || !parsedPublicKey || parsedPublicKey.kty !== "RSA" || parsedPublicKey.alg !== "RSA-OAEP-256") {
    return res.status(400).send("아이디와 비밀번호를 확인해 주세요.");
  }

  // 같은 아이디의 사용자가 이미 있는지 조회합니다.
  if (User.findOne({ username: normalizedUsername })) {
    // 이미 사용 중인 아이디라면 409 응답을 반환합니다.
    return res.status(409).send("이미 사용 중인 아이디입니다.");
  }

  // 평문 비밀번호를 비용 계수 10으로 해시합니다.
  const hashedPassword = await bcrypt.hash(password, 10);
  // 해시된 비밀번호와 아이디를 새 사용자로 저장합니다.
  const user = User.create({
    username: normalizedUsername, password: hashedPassword, publicKey,
    name: normalizedName, email: normalizedEmail, phone: normalizedPhone,
  });
  return res.status(201).json({ message: "계정이 생성되었습니다.", username: user.username });
});

/**
 * 사용자 로그인 및 로그아웃 기능을 처리합니다.
 */

//@desc Get login page
//@route GET /
// 로그인 화면을 보여주는 컨트롤러입니다.
const getLogin = (req, res) => {
  res.render("home", { oauthProviders: oauthProviders() });
};

//@desc Login user
//@route POST /
// 입력된 자격 증명을 검증하고 로그인 토큰을 발급합니다.
const loginUser = asyncHandler(async (req, res) => {
  // 요청 본문에서 아이디와 비밀번호를 가져옵니다.
  const { username, password } = req.body;

  // 아이디로 사용자 정보를 조회합니다.
  const user = User.findOne({ username });

  // 사용자를 찾지 못하면 인증 실패 응답을 반환합니다.
  if (!user) {
    return res.status(401).json({ message: "일치하는 사용자가 없습니다." });
  }

  // 입력한 비밀번호와 데이터베이스의 해시 비밀번호를 비교합니다.
  const isMatch = await bcrypt.compare(password, user.password);

  // 비밀번호가 일치하지 않으면 인증 실패 응답을 반환합니다.
  if (!isMatch) {
    return res.status(401).json({ message: "비밀번호가 일치하지 않습니다." });
  }

  // 사용자 ID와 아이디를 담고 한 시간 뒤 만료되는 JWT를 생성합니다.
  const token = jwt.sign(
    // 토큰의 페이로드로 사용할 사용자 정보를 전달합니다.
    { id: user._id },
    // 토큰에 서명할 비밀 키를 전달합니다.
    jwtSecret,
    // 토큰 만료 시간을 한 시간으로 설정합니다.
    { expiresIn: "1h" }
  );
  // 브라우저에서 JavaScript로 읽을 수 없도록 HTTP 전용 쿠키에 토큰을 저장합니다.
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 1000,
  });

  // 인증이 끝나면 아이디어 목록 화면으로 이동합니다.
  return res.redirect("/ideas");
});

// @desc Logout
// @route GET /logout
// 로그인 토큰 쿠키를 지워 로그아웃 처리하는 컨트롤러입니다.
const logout = (req, res) => {
  // 로그인할 때 설정한 쿠키 옵션과 동일한 옵션으로 토큰 쿠키를 제거합니다.
  res.clearCookie("token", { httpOnly: true, sameSite: "lax" });
  // 로그아웃 후 로그인 화면으로 이동합니다.
  return res.redirect("/");
};

// 라우터에서 사용할 인증 관련 컨트롤러들을 내보냅니다.
const getAdminSetup = (req, res) => res.render("admin-setup", { configured: Boolean(process.env.ADMIN_SETUP_KEY) });

const getProfile = (req, res) => {
  res.locals.currentUser = req.user;
  return res.render("profile", { user: req.user });
};

const updateProfile = asyncHandler((req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
  if (!name || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 || !/^[0-9+() -]{8,20}$/.test(phone)) {
    return res.status(400).send("성명, 이메일 또는 전화번호를 확인해 주세요.");
  }
  User.updateProfile(req.user._id, { name, email, phone });
  return res.redirect("/ideas");
});

const setupAdmin = asyncHandler(async (req, res) => {
  const { username, password, setupKey, publicKey } = req.body;
  if (!process.env.ADMIN_SETUP_KEY || setupKey !== process.env.ADMIN_SETUP_KEY) {
    return res.status(403).send("관리자 설정 키가 올바르지 않습니다.");
  }
  const database = require("../config/dbConnect")();
  if (database.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) {
    return res.status(409).send("관리자 계정이 이미 설정되었습니다.");
  }
  let parsedPublicKey;
  try {
    parsedPublicKey = JSON.parse(publicKey);
  } catch (error) {
    parsedPublicKey = null;
  }
  const normalizedUsername = typeof username === "string" ? username.trim() : "";
  if (!normalizedUsername || normalizedUsername.length > 40 || !password || password.length < 10 ||
      password.length > 128 || !parsedPublicKey || parsedPublicKey.kty !== "RSA" ||
      parsedPublicKey.alg !== "RSA-OAEP-256") {
    return res.status(400).send("아이디, 비밀번호 또는 공개키를 확인해 주세요.");
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  User.create({ username: normalizedUsername, password: hashedPassword, role: "admin", publicKey });
  return res.status(201).json({ message: "관리자 계정이 생성되었습니다." });
});

module.exports = { getRegister, registerUser, getLogin, loginUser, logout, getAdminSetup, setupAdmin, getProfile, updateProfile };