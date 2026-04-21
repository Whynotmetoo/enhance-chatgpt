import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const assetsDir = join(process.cwd(), "dist", "assets");
const forbiddenPattern = /process\.env|NODE_ENV/;

if (!existsSync(assetsDir)) {
  console.error("Missing dist/assets directory. Run the bundle build before verification.");
  process.exit(1);
}

const offendingFiles = readdirSync(assetsDir)
  .filter((fileName) => fileName.endsWith(".js"))
  .filter((fileName) => forbiddenPattern.test(readFileSync(join(assetsDir, fileName), "utf8")));

if (offendingFiles.length > 0) {
  console.error(`Unexpected Node env reference in browser bundle: ${offendingFiles.join(", ")}`);
  process.exit(1);
}
