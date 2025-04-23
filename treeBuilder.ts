// 📁 treeBuilder.ts — построение структуры ссылок
import { App, TFile, normalizePath, Vault } from "obsidian";

interface TreeNode {
  name: string;
  value: number;
  children?: TreeNode[];
}

export async function buildLinkTree(app: App, rootFolder: string) {
  const markdownFiles = app.vault.getMarkdownFiles().filter((f: TFile) => f.path.startsWith(rootFolder + "/"));

  // Собираем входящие ссылки
  const backlinksMap: Map<string, Set<string>> = new Map();

  for (const file of markdownFiles) {
    const links = app.metadataCache.getFileCache(file)?.links || [];
    for (const link of links) {
      const target = link.link.split("#")[0];
      if (!backlinksMap.has(target)) backlinksMap.set(target, new Set());
      backlinksMap.get(target)!.add(file.path);
    }
  }

  // Рекурсивно строим дерево
  const visited = new Set<string>();

  function buildNode(path: string): TreeNode | null {
    if (visited.has(path)) return null;
    visited.add(path);

    const children: TreeNode[] = [];
    const backlinks = backlinksMap.get(path);
    if (backlinks) {
      for (const source of backlinks) {
        const child = buildNode(source);
        if (child) children.push(child);
      }
    }

    return {
      name: path.split("/").pop()!,
      value: backlinks?.size || 0,
      ...(children.length > 0 ? { children } : {})
    };
  }

  const root: TreeNode = {
    name: "Корень",
    value: 0,
    children: markdownFiles
      .map((f: TFile) => buildNode(f.path))
      .filter(Boolean) as TreeNode[]
  };

  const outputPath = normalizePath("plugins/obsidian-linkmap-plugin/visuals/links.json");
  await app.vault.adapter.write(outputPath, JSON.stringify(root, null, 2));
}
