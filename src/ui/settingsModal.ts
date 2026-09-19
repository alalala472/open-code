import blessed from "blessed";
import type { AgentConfig } from "../types.js";
import { saveConfig } from "../config/store.js";

interface FieldSpec {
  key: keyof AgentConfig;
  label: string;
  censor?: boolean;
}

const FIELDS: FieldSpec[] = [
  { key: "apiKey", label: "Api key", censor: true },
  { key: "baseUrl", label: "Base url" },
  { key: "model", label: "Model" },
];

// Navigasi utama pakai event 'submit'/'cancel' bawaan blessed (dipicu Enter/Escape),
// karena itu paling stabil di semua jenis keyboard/terminal. Ctrl+S/X/Y tetap
// diikat sebagai alias tambahan untuk yang pakai keyboard fisik.
export function openSettingsModal(
  screen: blessed.Widgets.Screen,
  current: AgentConfig,
  onDone: (updated: AgentConfig | null) => void
) {
  const draft: AgentConfig = { ...current };

  const box = blessed.box({
    top: "center",
    left: "center",
    width: "90%",
    height: FIELDS.length * 3 + 6,
    border: { type: "line" },
    label: " Konfigurasi API ",
    style: { border: { fg: "cyan" }, label: { fg: "cyan" } },
    tags: true,
  });

  const inputs: blessed.Widgets.TextboxElement[] = [];

  FIELDS.forEach((field, idx) => {
    blessed.text({
      parent: box,
      top: idx * 3 + 1,
      left: 2,
      content: field.label,
    });

    const input = blessed.textbox({
      parent: box,
      top: idx * 3 + 2,
      left: 2,
      width: "90%",
      height: 1,
      inputOnFocus: true,
      censor: field.censor,
      style: {
        fg: "white",
        bg: "black",
        focus: { bg: "blue" },
      },
      value: String(draft[field.key] ?? ""),
    });

    inputs.push(input);
  });

  blessed.text({
    parent: box,
    bottom: 0,
    left: 2,
    content: "Enter: field berikutnya (Enter di field terakhir = simpan) | Esc: batal",
    style: { fg: "grey" },
  });

  let activeIndex = 0;
  let finished = false;

  function focusField(i: number) {
    activeIndex = (i + inputs.length) % inputs.length;
    inputs[activeIndex].focus();
    screen.render();
  }

  function submitAll() {
    if (finished) return;
    if (!draft.apiKey || !draft.apiKey.trim()) {
      focusField(0);
      return;
    }
    finished = true;
    saveConfig(draft);
    cleanup();
    onDone(draft);
  }

  function cancelAll() {
    if (finished) return;
    finished = true;
    cleanup();
    onDone(null);
  }

  function cleanup() {
    screen.remove(box);
    screen.render();
  }

  inputs.forEach((input, idx) => {
    const isLast = idx === inputs.length - 1;

    // 'submit' terpicu otomatis saat user tekan Enter di textbox ini
    input.on("submit", (value: string) => {
      draft[FIELDS[idx].key] = value as any;
      if (isLast) {
        submitAll();
      } else {
        focusField(idx + 1);
      }
    });

    // 'cancel' terpicu otomatis saat user tekan Escape di textbox ini
    input.on("cancel", () => cancelAll());

    // Alias untuk keyboard fisik (tidak bentrok dengan handler internal blessed)
    input.key(["C-s"], () => {
      draft[FIELDS[idx].key] = (input as any).getValue();
      focusField(idx + 1);
    });
    input.key(["C-x"], () => {
      draft[FIELDS[idx].key] = (input as any).getValue();
      submitAll();
    });
    input.key(["C-y"], () => cancelAll());
  });

  screen.append(box);
  focusField(0);
}
