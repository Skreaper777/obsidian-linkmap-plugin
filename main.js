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
        var _a;
        const markdownFiles = app.vault
            .getMarkdownFiles()
            .filter((f) => f.path.startsWith(rootFolder + "/"));
        const backlinksMap = new Map();
        for (const file of markdownFiles) {
            const links = ((_a = app.metadataCache.getFileCache(file)) === null || _a === void 0 ? void 0 : _a.links) || [];
            for (const link of links) {
                const target = link.link.split("#")[0];
                if (!backlinksMap.has(target))
                    backlinksMap.set(target, new Set());
                backlinksMap.get(target).add(file.path);
            }
        }
        const visited = new Set();
        function buildNode(path, depth) {
            if (visited.has(path) || depth > maxDepth)
                return null;
            visited.add(path);
            const children = [];
            const backlinks = backlinksMap.get(path);
            if (backlinks) {
                for (const source of backlinks) {
                    const child = buildNode(source, depth + 1);
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
                .filter((node) => Boolean(node))
        };
        // Определяем путь для вывода
        let outputPath = "links.json";
        const adapter = app.vault.adapter;
        if (adapter instanceof obsidian_1.FileSystemAdapter) {
            const basePath = adapter.getBasePath();
            outputPath = (0, obsidian_1.normalizePath)(`${basePath}/.obsidian/plugins/obsidian-linkmap-plugin/visuals/links.json`);
            // Записываем напрямую через fs, чтобы избежать двойного применения basePath
            yield fs_1.promises.writeFile(outputPath, JSON.stringify(root, null, 2));
        }
        else {
            // Пишем внутри хранилища Obsidian
            yield app.vault.adapter.write(outputPath, JSON.stringify(root, null, 2));
        }
    });
}
