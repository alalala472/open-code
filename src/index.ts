import { createMainScreen } from "./ui/screen.js";
import { openSettingsModal } from "./ui/settingsModal.js";
import { loadConfig, configPath } from "./config/store.js";
import { runAgentTurn } from "./agent/agent.js";
import { getProjectRoot, setProjectRoot } from "./agent/tools.js";
import type { ChatMessage, AgentConfig, ToolDefinition } from "./types.js";

let config: AgentConfig = loadConfig();
const history: ChatMessage[] = [];

const { screen, log, inputBox, setStatus } = createMainScreen();

// Approval pending: diisi saat agent minta izin jalankan tool sensitif (bash/write/edit).
// Pesan berikutnya dari user akan ditafsirkan sebagai jawaban y/n, bukan chat baru.
let pendingApproval: { resolve: (v: boolean) => void; tool: ToolDefinition } | null = null;

log.log(`{grey-fg}Config file: ${configPath()}{/grey-fg}`);
log.log(`{grey-fg}Project root: ${getProjectRoot()}{/grey-fg}`);
if (!config.apiKey) {
  log.log("{yellow-fg}Belum ada API key. Ketik /config untuk konfigurasi.{/yellow-fg}");
}
log.log("{grey-fg}Command tersedia: /config  /cd <folder>  /pwd  /help  /clear{/grey-fg}");
setStatus("idle");

function openConfig() {
  openSettingsModal(screen, config, (updated) => {
    if (updated) {
      config = updated;
      log.log("{green-fg}Konfigurasi tersimpan.{/green-fg}");
    } else {
      log.log("{grey-fg}Konfigurasi dibatalkan.{/grey-fg}");
    }
    setStatus("idle");
    inputBox.focus();
    screen.render();
  });
}

// Ctrl+F diikat LANGSUNG ke inputBox (bukan screen). Ini fix untuk bug lama:
// saat inputBox sedang mode edit, blessed "grab" semua keypress untuk dirinya
// sendiri, jadi key-binding di level screen (screen.key) tidak pernah kebaca.
// Ctrl+F ini jadi alias tambahan; jalur utama tetap command "/config".
inputBox.key(["C-f"], () => openConfig());

function printHelp() {
  log.log(
    [
      "{bold}Command tersedia:{/bold}",
      "  /config          buka form konfigurasi api key / base url / model",
      "  /cd <folder>     pindah project root (folder kerja tool file & bash)",
      "  /pwd             tampilkan project root aktif",
      "  /clear           bersihkan layar percakapan",
      "  /help            tampilkan pesan ini",
    ].join("\n")
  );
}

async function handleCommand(text: string) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(" ");

  switch (cmd) {
    case "/config":
      openConfig();
      return;
    case "/cd": {
      if (!arg) {
        log.log("{yellow-fg}Pakai: /cd <folder>, contoh: /cd ~/storage/shared/MyProject{/yellow-fg}");
        return;
      }
      try {
        const resolved = setProjectRoot(arg);
        log.log(`{green-fg}Project root sekarang: ${resolved}{/green-fg}`);
      } catch (err: any) {
        log.log(`{red-fg}Gagal pindah folder: ${err.message}{/red-fg}`);
      }
      return;
    }
    case "/pwd":
      log.log(`{grey-fg}Project root: ${getProjectRoot()}{/grey-fg}`);
      return;
    case "/clear":
      log.setContent("");
      screen.render();
      return;
    case "/help":
      printHelp();
      return;
    default:
      log.log(`{red-fg}Command tidak dikenal: ${cmd}. Ketik /help untuk daftar command.{/red-fg}`);
      return;
  }
}

async function handleApprovalAnswer(text: string) {
  if (!pendingApproval) return;
  const normalized = text.trim().toLowerCase();
  const yes = ["y", "yes", "ya"].includes(normalized);
  const no = ["n", "no", "tidak"].includes(normalized);

  if (!yes && !no) {
    log.log("{yellow-fg}Ketik 'y' untuk izinkan atau 'n' untuk tolak.{/yellow-fg}");
    return;
  }
  const { resolve } = pendingApproval;
  pendingApproval = null;
  setStatus("berpikir...", "yellow");
  resolve(yes);
}

inputBox.on("submit", async (value: string) => {
  const text = value.trim();
  inputBox.clearValue();
  inputBox.focus();
  screen.render();

  if (!text) return;

  if (pendingApproval) {
    await handleApprovalAnswer(text);
    return;
  }

  if (text.startsWith("/")) {
    await handleCommand(text);
    return;
  }

  log.log(`{bold}Kamu:{/bold} ${text}`);
  history.push({ role: "user", content: text });
  setStatus("berpikir...", "yellow");

  try {
    const reply = await runAgentTurn(
      config,
      history.slice(0, -1),
      text,
      (line) => {
        log.log(`{grey-fg}${line}{/grey-fg}`);
        setStatus(line.replace(/^[>?x]\s*/, ""), "yellow");
        screen.render();
      },
      (tool, input) => {
        return new Promise<boolean>((resolve) => {
          pendingApproval = { resolve, tool };
          setStatus(`menunggu izin: ${tool.name} (ketik y/n)`, "yellow");
        });
      }
    );
    history.push({ role: "assistant", content: reply });
    log.log(`{cyan-fg}{bold}Agent:{/bold}{/cyan-fg} ${reply}`);
    setStatus("idle", "green");
  } catch (err: any) {
    log.log(`{red-fg}Error: ${err.message}{/red-fg}`);
    setStatus("idle", "red");
  }
  screen.render();
});

screen.render();
