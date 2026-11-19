const asyncHandler = require("express-async-handler");
const crypto = require("node:crypto");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../models/userModel");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error("JWT_SECRET을 환경 변수로 설정해 주세요.");

const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const configs = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    scope: "openid email profile",
  },
  kakao: {
    clientId: process.env.KAKAO_CLIENT_ID,
    clientSecret: process.env.KAKAO_CLIENT_SECRET,
    authorizationEndpoint: "https://kauth.kakao.com/oauth/authorize",
    tokenEndpoint: "https://kauth.kakao.com/oauth/token",
    jwksUri: "https://kauth.kakao.com/.well-known/jwks.json",
    issuer: "https://kauth.kakao.com",
    scope: "openid profile_nickname account_email",
  },
};
const jwksCache = new Map();
const callbackUrl = (provider) => `${baseUrl}/auth/${provider}/callback`;
const isConfigured = (provider) => Boolean(configs[provider].clientId && configs[provider].clientSecret);

const unavailable = (res) => res.status(503).send("이 소셜 로그인은 서버에 OAuth 클라이언트 설정이 필요합니다.");
const fetchJwks = async (provider) => {
  const response = await fetch(configs[provider].jwksUri);
  if (!response.ok) throw new Error(`${provider} signing-key request failed (${response.status}).`);
  const jwks = { keys: (await response.json()).keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  jwksCache.set(provider, jwks);
  return jwks;
};

const startOAuth = (provider) => asyncHandler((req, res) => {
  const config = configs[provider];
  if (!isConfigured(provider)) return unavailable(res);

  const state = crypto.randomBytes(32).toString("base64url");
  const nonce = crypto.randomBytes(32).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const signedState = jwt.sign({ provider, state, nonce, verifier }, jwtSecret, { expiresIn: "10m" });
  res.cookie(`oauth_${provider}`, signedState, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: `/auth/${provider}/callback`,
  });

  const authorizationUrl = new URL(config.authorizationEndpoint);
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callbackUrl(provider),
    response_type: "code",
    scope: config.scope,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return res.redirect(302, authorizationUrl.toString());
});

const getSigningKey = async (provider, kid) => {
  let jwks = jwksCache.get(provider);
  if (!jwks || jwks.expiresAt < Date.now()) jwks = await fetchJwks(provider);
  let jwk = jwks.keys.find((key) => key.kid === kid && key.use === "sig");
  if (!jwk) {
    jwks = await fetchJwks(provider);
    jwk = jwks.keys.find((key) => key.kid === kid && key.use === "sig");
  }
  if (!jwk) throw new Error(`${provider} signing key was not found.`);
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
};

const verifyIdentityToken = async (provider, idToken, expectedNonce) => {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || decoded.header.alg !== "RS256" || !decoded.header.kid) {
    throw new Error(`${provider} returned an invalid identity token.`);
  }
  const publicKey = await getSigningKey(provider, decoded.header.kid);
  const claims = jwt.verify(idToken, publicKey, {
    algorithms: ["RS256"],
    audience: configs[provider].clientId,
    issuer: configs[provider].issuer,
  });
  if (!claims.sub || claims.nonce !== expectedNonce) {
    throw new Error(`${provider} identity token claims did not match the login request.`);
  }
  return claims;
};

const finishOAuth = (provider) => asyncHandler(async (req, res) => {
  const config = configs[provider];
  const cookieName = `oauth_${provider}`;
  const clearStateCookie = () => res.clearCookie(cookieName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/auth/${provider}/callback`,
  });
  if (!isConfigured(provider)) return unavailable(res);

  const { code, state } = req.query;
  let pending;
  try {
    pending = jwt.verify(req.cookies[cookieName], jwtSecret);
  } catch (error) {
    clearStateCookie();
    return res.status(400).send("OAuth 로그인 상태가 만료되었거나 올바르지 않습니다. 다시 시도해 주세요.");
  }
  clearStateCookie();
  if (!code || !state || pending.provider !== provider || pending.state !== state) {
    return res.status(400).send("OAuth 로그인 요청을 확인할 수 없습니다. 다시 시도해 주세요.");
  }

  const tokenResponse = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: String(code),
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: callbackUrl(provider),
      code_verifier: pending.verifier,
    }),
  });
  if (!tokenResponse.ok) {
    return res.status(502).send(`${provider} 토큰 교환에 실패했습니다. OAuth 설정과 콜백 URL을 확인해 주세요.`);
  }
  const tokens = await tokenResponse.json();
  if (!tokens.id_token) {
    return res.status(502).send(`${provider}에서 ID 토큰을 받지 못했습니다. OpenID Connect 설정을 확인해 주세요.`);
  }

  let claims;
  try {
    claims = await verifyIdentityToken(provider, tokens.id_token, pending.nonce);
  } catch (error) {
    return res.status(401).send(`${provider} 계정 확인에 실패했습니다: ${error.message}`);
  }

  let user = User.findByOAuth(provider, claims.sub);
  const profile = {
    name: typeof (claims.name || claims.nickname) === "string" ? (claims.name || claims.nickname).trim() : "",
    email: typeof claims.email === "string" && claims.email_verified !== false
      ? claims.email.trim().toLowerCase() : "",
  };
  if (!user) {
    const username = `${provider}_${crypto.createHash("sha256").update(`${provider}:${claims.sub}`).digest("hex").slice(0, 32)}`;
    const randomPassword = await bcrypt.hash(crypto.randomBytes(48).toString("base64url"), 10);
    try {
      user = User.createOAuthAccount({
        provider, subject: claims.sub, username, password: randomPassword, ...profile,
      });
    } catch (error) {
      if (!String(error.code).startsWith("SQLITE_CONSTRAINT")) throw error;
      user = User.findByOAuth(provider, claims.sub);
      if (!user) throw error;
    }
  }
  User.updateOAuthProfile(user._id, profile);
  user = User.findByOAuth(provider, claims.sub);

  const token = jwt.sign({ id: user._id }, jwtSecret, { expiresIn: "1h" });
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 1000,
  });
  return res.redirect("/ideas");
});

module.exports = {
  startGoogle: startOAuth("google"),
  googleCallback: finishOAuth("google"),
  startKakao: startOAuth("kakao"),
  kakaoCallback: finishOAuth("kakao"),
};
