export interface AgentConfig {
  apiKey: string;
  baseUrl: string; // contoh: https://api.anthropic.com/v1
  model: string; // contoh: claude-sonnet-4-6
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  // JSON schema sederhana untuk parameter tool
  parameters: Record<string, unknown>;
  run: (input: any) => Promise<string>;
  // Tool yang mengubah file/sistem atau menjalankan perintah wajib minta izin dulu
  requiresApproval?: boolean;
  // Ringkasan singkat untuk ditampilkan ke user saat minta izin
  describeCall?: (input: any) => string;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  input: Record<string, unknown>;
}
