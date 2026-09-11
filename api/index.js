// Vercel Serverless Function entry point. Exports the Express app directly —
// app.listen() must never be called here; Vercel manages the HTTP server.
const app = require("../src/app");

module.exports = app;
