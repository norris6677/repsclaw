/**
 * Markdown Frontmatter Utilities
 * 统一的 YAML frontmatter 序列化/解析工具
 *
 * 被以下模块共享使用：
 * - raw-source.manager.ts
 * - subscription-db.markdown.ts
 * - wiki-manager.service.ts
 */

/**
 * YAML frontmatter 序列化
 */
export function serializeFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = ['---'];

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      lines.push(`${key}:`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${item}`);
        }
      }
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === 'string') {
      // Check if it's a JSON string (starts with { or [)
      if (value.startsWith('{') || value.startsWith('[')) {
        const escaped = value.replace(/"/g, '\\"');
        lines.push(`${key}: "${escaped}"`);
      } else if (
        value.includes(':') ||
        value.includes('#') ||
        value.includes('"') ||
        value.includes("'") ||
        value.includes('\n') ||
        value.startsWith(' ') ||
        value.endsWith(' ')
      ) {
        const escaped = value.replace(/"/g, '\\"');
        lines.push(`${key}: "${escaped}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    } else if (typeof value === 'object') {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * YAML frontmatter 解析
 */
export function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const yamlContent = match[1];
  const frontmatter: Record<string, unknown> = {};

  const lines = yamlContent.split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] = [];
  let isInArray = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('- ')) {
      if (isInArray && currentKey) {
        currentArray.push(trimmed.substring(2).trim());
      }
      continue;
    }

    if (isInArray && currentKey) {
      frontmatter[currentKey] = currentArray;
      currentArray = [];
      isInArray = false;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.substring(0, colonIndex).trim();
      let value = trimmed.substring(colonIndex + 1).trim();

      const nextLines = lines.slice(lines.indexOf(line) + 1);
      const nextNonEmpty = nextLines.find(l => l.trim());
      if (nextNonEmpty?.trim().startsWith('- ')) {
        isInArray = true;
        currentKey = key;
        continue;
      }

      if (value === '' || value === 'null' || value === '~') {
        frontmatter[key] = null;
      } else if (value === 'true') {
        frontmatter[key] = true;
      } else if (value === 'false') {
        frontmatter[key] = false;
      } else if (value === '[]') {
        frontmatter[key] = [];
      } else if (/^\d+$/.test(value)) {
        frontmatter[key] = parseInt(value, 10);
      } else if (/^\d+\.\d+$/.test(value)) {
        frontmatter[key] = parseFloat(value);
      } else if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        frontmatter[key] = value.slice(1, -1).replace(/\\"/g, '"');
      } else {
        frontmatter[key] = value;
      }
    }
  }

  if (isInArray && currentKey) {
    frontmatter[currentKey] = currentArray;
  }

  const body = content.substring(match[0].length);
  return { frontmatter, body };
}

/**
 * 文件名安全化
 */
export function sanitizeFilename(name: string): string {
  if (!name || typeof name !== 'string') {
    return 'unknown';
  }
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}
