import blessed from "blessed";

export function createMainScreen() {
  const screen = blessed.screen({
    smartCSR: true,
    title: "cx-agent",
  });

  const header = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    content: " cx-agent",
    style: { fg: "black", bg: "cyan", bold: true },
  });

  const statusBar = blessed.box({
    top: 1,
    left: 0,
    width: "100%",
    height: 1,
    content: " idle",
    tags: true,
    style: { fg: "white", bg: "black" },
  });

  const log = blessed.log({
    top: 2,
    left: 0,
    width: "100%",
    height: "100%-6",
    border: { type: "line" },
    label: " percakapan ",
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    style: { border: { fg: "cyan" } },
  });

  const hintBar = blessed.box({
    bottom: 3,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    content: " {grey-fg}/config  /cd <folder>  /pwd  /help  /clear{/grey-fg}",
  });

  const inputBox = blessed.textbox({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    border: { type: "line" },
    label: " ketik pesan atau /command, Enter untuk kirim ",
    inputOnFocus: true,
    style: { border: { fg: "cyan" } },
  });

  screen.append(header);
  screen.append(statusBar);
  screen.append(log);
  screen.append(hintBar);
  screen.append(inputBox);

  // Ctrl+C diikat langsung ke inputBox (bukan screen) karena saat inputBox
  // sedang dalam mode edit ("grab"), key-binding di level screen tidak pernah
  // menerima event apa pun. Ini juga akar masalah kenapa semua Ctrl+X gagal.
  inputBox.key(["C-c"], () => process.exit(0));

  function setStatus(text: string, color: "white" | "yellow" | "green" | "red" = "white") {
    statusBar.setContent(` {${color}-fg}${text}{/${color}-fg}`);
    statusBar.style.fg = color;
    screen.render();
  }

  inputBox.focus();
  screen.render();

  return { screen, log, inputBox, statusBar, setStatus };
}
