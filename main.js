"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLinkTree = buildLinkTree;
// 📁 main.ts — основной файл плагина
const obsidian_1 = require("obsidian");
const fs_1 = require("fs");
class LinkMapPlugin extends obsidian_1.Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            this.addCommand({
                id: "generate-link-tree",
                name: "Сгенерировать карту ссылок (links.json)",
                callback: () => __awaiter(this, void 0, void 0, function* () {
                    yield buildLinkTree(this.app, "Теги", 7, 20);
                    new obsidian_1.Notice("Файл links.json обновлён 🚀");
                })
            });
        });
    }
    onunload() { }
}
exports.default = LinkMapPlugin;
function buildLinkTree(app_1, rootFolder_1) {
    return __awaiter(this, arguments, void 0, function* (app, rootFolder, maxDepth = 7, rootLimit = 20) {
        const markdownFiles = app.vault
            .getMarkdownFiles()
            .filter((f) => f.path.startsWith(rootFolder + "/"));
        const backlinksMap = new Map();
        // Используем неофициальный метод getBacklinksForFile, обойдя проверку типов через any
        for (const file of markdownFiles) {
            // метод getBacklinksForFile отсутствует в типах, но доступен во время выполнения
            const cache = app.metadataCache;
            const backlinksRaw = cache.getBacklinksForFile(file);
            if (!backlinksRaw)
                continue;
            // backlinksRaw — Map-подобный объект с методами keys() и get()
            for (const src of backlinksRaw.keys()) {
                const normalizedSrc = (0, obsidian_1.normalizePath)(src);
                if (!backlinksMap.has(file.path))
                    backlinksMap.set(file.path, new Set());
                backlinksMap.get(file.path).add(normalizedSrc);
            }
        }
        const visited = new Set();
        function buildNode(path, depth) {
            if (visited.has(path) || depth > maxDepth)
                return null;
            visited.add(path);
            const children = [];
            const sources = backlinksMap.get(path);
            if (sources) {
                for (const srcPath of sources) {
                    const child = buildNode(srcPath, depth + 1);
                    if (child)
                        children.push(child);
                }
            }
            return { name: path, value: 0, children };
        }
        const root = {
            name: rootFolder,
            value: 0,
            children: markdownFiles
                .slice(0, rootLimit)
                .map((f) => buildNode(f.path, 1))
                .filter((n) => Boolean(n))
        };
        let outputPath = "links.json";
        const adapter = app.vault.adapter;
        if (adapter instanceof obsidian_1.FileSystemAdapter) {
            const basePath = adapter.getBasePath();
            outputPath = (0, obsidian_1.normalizePath)(`${basePath}/.obsidian/plugins/obsidian-linkmap-plugin/visuals/links.json`);
            yield fs_1.promises.writeFile(outputPath, JSON.stringify(root, null, 2));
        }
        else {
            yield app.vault.adapter.write(outputPath, JSON.stringify(root, null, 2));
        }
    });
}
