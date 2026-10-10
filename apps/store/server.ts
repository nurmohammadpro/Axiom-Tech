import { createServer } from "node:http";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

app.prepare().then(() => {
  // Node's HTTP server + Next handler (same path `next start` uses). A Fastify
  // wrapper here drained request bodies, breaking every API route handler.
  createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    });
  }).listen(PORT, HOST, () => {
    console.log(`Server listening at http://${HOST}:${PORT}`);
  });
});
