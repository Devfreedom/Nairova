require("dotenv").config();
const app = require("./app");
const { bootstrapAdmin } = require("./src/config/bootstrapAdmin");

const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET) {
  console.error("Missing required environment variable: JWT_SECRET. Server cannot start safely.");
  process.exit(1);
}

async function start() {
  try {
    await bootstrapAdmin();
  } catch (err) {
    console.error("Admin bootstrap failed:", err.message || err);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

start();
