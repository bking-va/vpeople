import { runSeed } from "../lib/seed";

const shouldReset = process.argv.includes("--reset");

runSeed({ reset: shouldReset })
  .then((result) => {
    console.log("Seed complete:", result);
    process.exit(0);
  })
  .catch((e) => {
    console.error("❌ Seeding failed");
    console.error(e);
    process.exit(1);
  });
