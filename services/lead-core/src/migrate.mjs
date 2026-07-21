#!/usr/bin/env node
import { migrate } from "./db.mjs";
import { DB_PATH } from "./config.mjs";

const p = migrate();
console.log("✓ migrated", p);
