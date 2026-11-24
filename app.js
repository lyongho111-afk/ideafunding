// Express 웹 프레임워크를 불러옵니다.
const express = require("express");
// MySQL 데이터베이스 연결 모듈을 불러옵니다.
const dbConnect = require("./config/dbConnect");
// HTML 폼의 HTTP 메서드 재정의를 처리하는 모듈을 불러옵니다.
const methodOverride = require("method-override");
// 요청 쿠키를 읽고 응답 쿠키를 설정하는 모듈을 불러옵니다.
const cookieParser = require("cookie-parser");
// 운영체제별 파일 경로를 안전하게 조합하는 Node.js 내장 모듈을 불러옵니다.
const path = require("node:path");

// Express 애플리케이션 인스턴스를 생성합니다.
const app = express();

// 서버가 요청을 받을 포트 번호를 지정합니다.
const port = Number(process.env.PORT) || 3000;

// public 폴더의 파일(CSS, 이미지 등)을 정적 파일로 제공합니다.
app.use(express.static(path.join(__dirname, "public")));
// 폼 요청의 _method 값으로 PUT/DELETE 등의 메서드를 사용할 수 있게 합니다.
app.use(methodOverride("_method"));

// 응답 템플릿 엔진으로 EJS를 사용하도록 설정합니다.
app.set("view engine", "ejs");
// EJS 템플릿이 저장된 폴더의 경로를 설정합니다.
app.set("views", path.join(__dirname, "views"));

// 요청의 쿠키를 분석하는 미들웨어를 등록합니다.
app.use(cookieParser());

// JSON 형식 요청 본문을 객체로 변환하는 미들웨어를 등록합니다.
app.use(express.json({ limit: "6mb" }));
// URL 인코딩 형식의 폼 본문을 객체로 변환하는 미들웨어를 등록합니다.
app.use(express.urlencoded({ extended: true }));

// 루트 경로의 로그인/회원가입 라우트를 연결합니다.
app.use("/", require("./routes/loginRoutes"));
app.use("/auth", require("./routes/oauthRoutes"));
app.use("/ideas", require("./routes/ideaRoutes"));

dbConnect.initializeDatabase().then(() => {
  app.listen(port, "0.0.0.0", () => {
    console.log(`${port}번 포트에서 서버 실행 중`);
  });
}).catch((error) => {
  console.error("MySQL 데이터베이스 초기화에 실패했습니다.", error);
  process.exitCode = 1;
});

