// LLM-assisted layer naming. Runs in the main plugin thread (has `fetch`,
// governed by manifest networkAccess, and access to the node tree).
// Expects an OpenAI-compatible /chat/completions endpoint (Qwen DashScope
// compatible-mode works).

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface NamingContextItem {
  id: string;
  nodeType: string;
  currentName: string;
  parentName: string;
  texts: string[];
}

export function isLlmConfigured(c: LlmConfig | null): c is LlmConfig {
  return !!c && !!c.baseUrl && !!c.model;
}

const MAX_TEXTS = 6;

export function gatherNamingContext(node: SceneNode): NamingContextItem {
  const texts: string[] = [];
  if ('findAllWithCriteria' in node) {
    const textNodes = (node as ChildrenMixin & SceneNode).findAllWithCriteria({ types: ['TEXT'] });
    for (const t of textNodes) {
      const chars = (t as TextNode).characters?.trim();
      if (chars) texts.push(chars.slice(0, 40));
      if (texts.length >= MAX_TEXTS) break;
    }
  } else if (node.type === 'TEXT') {
    const chars = (node as TextNode).characters?.trim();
    if (chars) texts.push(chars.slice(0, 40));
  }
  const parentName = node.parent && 'name' in node.parent ? node.parent.name : '';
  return {
    id: node.id,
    nodeType: node.type,
    currentName: node.name,
    parentName,
    texts,
  };
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  if (b.endsWith('/chat/completions')) return b;
  if (b.endsWith('/v1')) return `${b}${path}`;
  return `${b}${path}`;
}

function extractJsonArray(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : content;
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start >= 0 && end > start) {
    return JSON.parse(raw.slice(start, end + 1));
  }
  return JSON.parse(raw);
}

const SYSTEM_PROMPT =
  '你是协助 Figma 设计稿转代码的命名助手。给定若干图层（类型、当前名、父层名、内部文字），' +
  '为每个图层起一个简洁、语义化、PascalCase 的英文名，便于作为代码组件/元素标识符（如 PrimaryButton、PriceLabel、AvatarImage、HeaderBar）。' +
  '只依据提供的信息，不要臆造。严格只返回 JSON 数组，每项形如 {"id":"...","name":"PascalCaseName"}，不要任何解释或额外文本。';

export async function suggestNames(
  config: LlmConfig,
  items: NamingContextItem[],
): Promise<Map<string, string>> {
  const url = joinUrl(config.baseUrl, '/chat/completions');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  const body = {
    model: config.model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(items) },
    ],
  };

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error('模型返回为空');

  const parsed = extractJsonArray(content);
  const out = new Map<string, string>();
  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      if (entry && typeof entry.id === 'string' && typeof entry.name === 'string') {
        const name = entry.name.trim();
        if (name) out.set(entry.id, name);
      }
    }
  }
  return out;
}
