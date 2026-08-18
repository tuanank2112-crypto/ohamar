const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync("data/openclaw.json", "utf8"));
cfg.channels.zaloclaw.allowFrom = ["*"];
fs.writeFileSync("data/openclaw.json", JSON.stringify(cfg, null, 2));
console.log("✅ Fixed allowFrom=[*]");
