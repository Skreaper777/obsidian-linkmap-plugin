// 📁 main.ts — основной файл плагина
import { Plugin, Notice, normalizePath, FileSystemAdapter, App, TFile } from "obsidian";
import { promises as fs } from "fs";

interface TreeNode {
  name: string;
  value: number;
  children?: TreeNode[];
}

export default class LinkMapPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: "generate-link-tree",
      name: "Сгенерировать карту ссылок (links.json)",
      callback: async () => {
        await buildLinkTree(this.app, "Теги", 7, 20);
        new Notice("Файл links.json обновлён 🚀");
      }
    });
  }

  onunload() {}
}

export async function buildLinkTree(
  app: App,
  rootFolder: string,
  maxDepth: number = 7,
  rootLimit: number = 20
) {
  const markdownFiles = app.vault
    .getMarkdownFiles()
    .filter((f: TFile) => f.path.startsWith(rootFolder + "/"));

  const backlinksMap: Map<string, Set<string>> = new Map();

  for (const file of markdownFiles) {
    const links = app.metadataCache.getFileCache(file)?.links || [];
    for (const link of links) {
      const target = link.link.split("#")[0];
      if (!backlinksMap.has(target)) backlinksMap.set(target, new Set());
      backlinksMap.get(target)!.add(file.path);
    }
  }

  const visited = new Set<string>();

  function buildNode(path: string, depth: number): TreeNode | null {
    if (visited.has(path) || depth > maxDepth) return null;
    visited.add(path);

    const children: TreeNode[] = [];
    const backlinks = backlinksMap.get(path);
    if (backlinks) {
      for (const source of backlinks) {
        const child = buildNode(source, depth + 1);
        if (child) children.push(child);
      }
    }

    return { name: path, value: 0, children };
  }

  const root: TreeNode = {
    name: rootFolder,
    value: 0,
    children: markdownFiles
      .slice(0, rootLimit)
      .map((f: TFile) => buildNode(f.path, 1))
      .filter((node): node is TreeNode => Boolean(node))
  };

  // Определяем путь для вывода
  let outputPath = "links.json";
  const adapter = app.vault.adapter;

  if (adapter instanceof FileSystemAdapter) {
    const basePath = adapter.getBasePath();
    outputPath = normalizePath(
      `${basePath}/.obsidian/plugins/obsidian-linkmap-plugin/visuals/links.json`
    );
    // Записываем напрямую через fs, чтобы избежать двойного применения basePath
    await fs.writeFile(outputPath, JSON.stringify(root, null, 2));
  } else {
    // Пишем внутри хранилища Obsidian
    await app.vault.adapter.write(outputPath, JSON.stringify(root, null, 2));
  }
}
