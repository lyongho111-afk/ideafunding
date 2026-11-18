const express = require("express");
const router = express.Router();
const checkLogin = require("../middlewares/checkLogin");
const controller = require("../controllers/ideaController");

router.use(controller.attachCurrentUser);
router.get("/", controller.listIdeas);
router.get("/key-setup", checkLogin, controller.keySetupPage);
router.post("/account/key", checkLogin, controller.saveAccountKey);
router.get("/new", checkLogin, controller.newIdeaPage);
router.post("/", checkLogin, controller.createIdea);
router.get("/my", checkLogin, controller.myIdeas);
router.get("/admin", checkLogin, checkLogin.requireAdmin, controller.adminDashboard);
router.post("/admin/:id/review", checkLogin, checkLogin.requireAdmin, controller.reviewIdea);
router.post("/:id/pledges", checkLogin, controller.pledge);
router.post("/:id/questions", checkLogin, controller.askQuestion);
router.post("/:id/questions/:questionId/answer", checkLogin, controller.answerQuestion);
router.post("/:id/disclosures/:backerId", checkLogin, controller.disclose);
router.get("/:id", controller.ideaPage);

module.exports = router;
