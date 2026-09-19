import type { AgentConfig, ChatMessage, ToolDefinition } from "../types.js";
import { allTools } from "./tools.js";

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason: string;
}

// Dipanggil setiap kali model minta tool yang requiresApproval=true.
// Return true = izinkan, false = tolak.
export type ApprovalCallback = (tool: ToolDefinition, input: any) => Promise<boolean>;

function toolsToApiSchema(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

async function callApi(
  config: AgentConfig,
  messages: any[],
  onLog: (line: string) => void
): Promise<AnthropicResponse> {
  const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      messages,
      tools: toolsToApiSchema(allTools),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return (await res.json()) as AnthropicResponse;
}

export async function runAgentTurn(
  config: AgentConfig,
  history: ChatMessage[],
  userInput: string,
  onLog: (line: string) => void,
  onApprove: ApprovalCallback
): Promise<string> {
  if (!config.apiKey) {
    throw new Error("API key belum diset. Ketik /config untuk konfigurasi.");
  }

  const messages: any[] = history.map((m) => ({ role: m.role, content: m.content }));
  messages.push({ role: "user", content: userInput });

  const toolMap = new Map(allTools.map((t) => [t.name, t]));

  // Loop sampai model berhenti minta tool
  for (let step = 0; step < 12; step++) {
    const response = await callApi(config, messages, onLog);

    const textParts = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const toolCalls = response.content.filter((b) => b.type === "tool_use");

    if (toolCalls.length === 0) {
      return textParts || "(tidak ada respons)";
    }

    // Kirim balik konten asisten (termasuk tool_use) lalu hasil tool
    messages.push({ role: "assistant", content: response.content });

    const toolResults: AnthropicContentBlock[] = [];
    for (const call of toolCalls) {
      const tool = toolMap.get(call.name!);
      let resultText: string;

      if (!tool) {
        resultText = `Tool ${call.name} tidak dikenal`;
      } else if (tool.requiresApproval) {
        const desc = tool.describeCall ? tool.describeCall(call.input) : tool.name;
        onLog(`? izin dibutuhkan: ${desc}`);
        const approved = await onApprove(tool, call.input);
        if (!approved) {
          resultText = "Ditolak oleh user, tool tidak dijalankan.";
          onLog(`x ditolak: ${tool.name}`);
        } else {
          onLog(`> menjalankan tool: ${tool.name}`);
          try {
            resultText = await tool.run(call.input);
          } catch (err: any) {
            resultText = `Error: ${err.message}`;
          }
        }
      } else {
        onLog(`> menjalankan tool: ${tool.name}`);
        try {
          resultText = await tool.run(call.input);
        } catch (err: any) {
          resultText = `Error: ${err.message}`;
        }
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: resultText,
      } as AnthropicContentBlock);
    }
    messages.push({ role: "user", content: toolResults });
  }

  return "(berhenti: terlalu banyak langkah tool berturut-turut)";
}
