const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const env = require("./lib/env");

const authRoutes = require("./routes/auth.routes");
const voteRoutes = require("./routes/vote.routes");
const electionRoutes = require("./routes/election.routes");
const candidateRoutes = require("./routes/candidate.routes");
const voterRoutes = require("./routes/voter.routes");
const resultRoutes = require("./routes/result.routes");
const reportRoutes = require("./routes/report.routes");
const auditRoutes = require("./routes/audit.routes");
const notificationRoutes = require("./routes/notification.routes");
const settingRoutes = require("./routes/setting.routes");
const mediaRoutes = require("./routes/media.routes");
const accountRoutes = require("./routes/account.routes");
const { ensureCsrfCookie, requireCsrf } = require("./middleware/csrf");

const app = express();

app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        mediaSrc: ["'self'", "blob:"], // camera stream
        connectSrc: ["'self'"],
      },
    },
  })
);
app.use(cors({ origin: env.APP_URL, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(ensureCsrfCookie);
app.use("/uploads", express.static(path.join(__dirname, "..", "public", "uploads")));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (req, res) => res.json({ ok: true, env: env.NODE_ENV }));

// CSRF is enforced on every /api route below (safe methods GET/HEAD/OPTIONS
// are exempt automatically inside requireCsrf).
app.use("/api", requireCsrf);

app.use("/api/auth", authRoutes);
app.use("/api/vote", voteRoutes);
app.use("/api/admin/elections", electionRoutes);
app.use("/api/admin", candidateRoutes);
app.use("/api/admin/voters", voterRoutes);
app.use("/api/admin/results", resultRoutes);
app.use("/api/admin/reports", reportRoutes);
app.use("/api/admin/audit", auditRoutes);
app.use("/api/admin/settings", settingRoutes);
app.use("/api/admin/accounts", accountRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/media", mediaRoutes);

// Centralized error handler — never leaks internals to the client.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Uploaded file is too large" });
  if (err.status === 415) return res.status(415).json({ error: "Only image uploads are accepted" });
  res.status(err.status || 500).json({ error: "Unexpected server error" });
});

module.exports = app;
