import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AgentConfig } from "../types.js";

const CONFIG_DIR = path.join(os.homedir(), ".cx-agent");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: AgentConfig = {
  apiKey: "",
  baseUrl: "https://api.anthropic.com/v1",
  model: "claude-sonnet-4-6",
};

export function loadConfig(): AgentConfig {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG };
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: AgentConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    mode: 0o600, // hanya owner yg bisa baca, karena berisi API key
  });
}

export function configPath(): string {
  return CONFIG_FILE;
}
