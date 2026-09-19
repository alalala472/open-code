import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDefinition } from "../types.js";

const execFileAsync = promisify(execFile);

// Project root BISA DIPINDAH saat runtime lewat command "/cd <path>" di UI.
// Ini yang membuat "tambah project internal HP" mungkin: user bisa /cd ke
// folder mana pun yang bisa diakses Termux (termasuk ~/storage/shared/... setelah
// menjalankan `termux-setup-storage`).
let projectRoot = process.cwd();

export function getProjectRoot(): string {
  return projectRoot;
}

export function setProjectRoot(newRoot: string): string {
  const resolved = path.resolve(newRoot);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Folder tidak ditemukan: ${resolved}`);
  }
  // Cek bisa dibaca & ditulis - kalau tidak, kasih tahu sekarang, bukan pas tool jalan
  fs.accessSync(resolved, fs.constants.R_OK | fs.constants.W_OK);
  projectRoot = resolved;
  return projectRoot;
}

// Semua path tool dibatasi ke dalam projectRoot demi keamanan dasar.
function resolveSafe(p: string): string {
  const resolved = path.resolve(projectRoot, p);
  if (!resolved.startsWith(projectRoot)) {
    throw new Error("Akses di luar project root tidak diizinkan (pakai /cd untuk pindah root)");
  }
  return resolved;
}

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description: "Membaca isi sebuah file teks di project.",
  parameters: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
  },
  run: async (input: { path: string }) => {
    const p = resolveSafe(input.path);
    return fs.readFileSync(p, "utf-8");
  },
};

export const writeFileTool: ToolDefinition = {
  name: "write_file",
  description: "Menulis (membuat/menimpa) sebuah file dengan konten baru.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
  requiresApproval: true,
  describeCall: (input) => `tulis file "${input.path}" (${(input.content ?? "").length} karakter)`,
  run: async (input: { path: string; content: string }) => {
    const p = resolveSafe(input.path);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, input.content, "utf-8");
    return `File ditulis: ${input.path}`;
  },
};

export const editFileTool: ToolDefinition = {
  name: "edit_file",
  description: "Mengganti sebuah string unik di file dengan string baru (find & replace).",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      old_str: { type: "string" },
      new_str: { type: "string" },
    },
    required: ["path", "old_str", "new_str"],
  },
  requiresApproval: true,
  describeCall: (input) => `edit file "${input.path}"`,
  run: async (input: { path: string; old_str: string; new_str: string }) => {
    const p = resolveSafe(input.path);
    const original = fs.readFileSync(p, "utf-8");
    const occurrences = original.split(input.old_str).length - 1;
    if (occurrences === 0) throw new Error("old_str tidak ditemukan di file");
    if (occurrences > 1) throw new Error("old_str muncul lebih dari sekali, harus unik");
    const updated = original.replace(input.old_str, input.new_str);
    fs.writeFileSync(p, updated, "utf-8");
    return `File diedit: ${input.path}`;
  },
};

export const listDirTool: ToolDefinition = {
  name: "list_dir",
  description: "Melihat isi sebuah direktori.",
  parameters: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
  },
  run: async (input: { path: string }) => {
    const p = resolveSafe(input.path ?? ".");
    return fs.readdirSync(p).join("\n");
  },
};

export const bashTool: ToolDefinition = {
  name: "bash",
  description: "Menjalankan perintah shell di dalam project root.",
  parameters: {
    type: "object",
    properties: { command: { type: "string" } },
    required: ["command"],
  },
  requiresApproval: true,
  describeCall: (input) => `jalankan command: ${input.command}`,
  run: async (input: { command: string }) => {
    const { stdout, stderr } = await execFileAsync("bash", ["-c", input.command], {
      cwd: projectRoot,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    return stdout || stderr || "(tidak ada output)";
  },
};

// Web search tanpa API key, pakai endpoint HTML DuckDuckGo (html.duckduckgo.com).
// Hasil di-parse dengan regex sederhana (judul, url, snippet) tanpa dependency tambahan.
export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description: "Mencari informasi di web lewat DuckDuckGo (tanpa API key). Kembalikan judul, url, dan cuplikan singkat.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      max_results: { type: "number" },
    },
    required: ["query"],
  },
  run: async (input: { query: string; max_results?: number }) => {
    const limit = Math.min(Math.max(input.max_results ?? 5, 1), 10);
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`;
    const res = await fetch(url, {
      headers: {
        // Beberapa proxy/anti-bot DuckDuckGo menolak request tanpa User-Agent wajar
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`DuckDuckGo error ${res.status}`);
    const html = await res.text();

    const results: { title: string; url: string; snippet: string }[] = [];
    const blockRegex = /<div class="result results_links[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
    const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/;

    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(html)) && results.length < limit) {
      const block = match[1];
      const linkMatch = linkRegex.exec(block);
      const snippetMatch = snippetRegex.exec(block);
      if (!linkMatch) continue;
      const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").trim();
      let rawUrl = linkMatch[1];
      // DuckDuckGo HTML membungkus url asli lewat redirect "/l/?uddg=..."
      const uddgMatch = /[?&]uddg=([^&]+)/.exec(rawUrl);
      if (uddgMatch) rawUrl = decodeURIComponent(uddgMatch[1]);
      results.push({
        title: stripTags(linkMatch[2]),
        url: rawUrl,
        snippet: snippetMatch ? stripTags(snippetMatch[1]) : "",
      });
    }

    if (results.length === 0) return "Tidak ada hasil ditemukan.";
    return results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join("\n\n");
  },
};

export const allTools: ToolDefinition[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  listDirTool,
  bashTool,
  webSearchTool,
];
