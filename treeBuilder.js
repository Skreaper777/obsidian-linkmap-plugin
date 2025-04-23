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
// 📁 treeBuilder.ts — построение структуры ссылок
const obsidian_1 = require("obsidian");
function buildLinkTree(app, rootFolder) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const markdownFiles = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(rootFolder + "/"));
        // Собираем входящие ссылки
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
        // Рекурсивно строим дерево
        const visited = new Set();
        function buildNode(path) {
            if (visited.has(path))
                return null;
            visited.add(path);
            const children = [];
            const backlinks = backlinksMap.get(path);
            if (backlinks) {
                for (const source of backlinks) {
                    const child = buildNode(source);
                    if (child)
                        children.push(child);
                }
            }
            return Object.assign({ name: path.split("/").pop(), value: (backlinks === null || backlinks === void 0 ? void 0 : backlinks.size) || 0 }, (children.length > 0 ? { children } : {}));
        }
        const root = {
            name: "Корень",
            value: 0,
            children: markdownFiles
                .map((f) => buildNode(f.path))
                .filter(Boolean)
        };
        const outputPath = (0, obsidian_1.normalizePath)("plugins/obsidian-linkmap-plugin/visuals/links.json");
        yield app.vault.adapter.write(outputPath, JSON.stringify(root, null, 2));
    });
}
