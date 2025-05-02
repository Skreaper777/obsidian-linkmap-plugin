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
const obsidian_1 = require("obsidian");
const fs_1 = require("fs");
/** Значения по умолчанию */
const DEFAULT_SETTINGS = {
    rootPathFile: "Теги/Проекты/__Проекты.md",
    temp: "Теги/Личное/Позитив 👍🏻/Успехи/_Успехи 🏆 (Я достиг успеха) (main).md",
    maxRootDepth: 8,
    rootLimit: 0,
    childLimit: 0,
    only_unique_page: false,
    sizeLimitRows: 3000,
    nameMaxLength: 40,
};
class LinkMapPlugin extends obsidian_1.Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadSettings();
            this.addCommand({
                id: 'generate-link-tree',
                name: 'Generate Link Tree JSON',
                callback: () => generateLinkTree(this.app, this.settings),
            });
            this.addSettingTab(new LinkMapSettingTab(this.app, this));
        });
    }
    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
        });
    }
    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
        });
    }
}
exports.default = LinkMapPlugin;
class LinkMapSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        this.containerEl.empty();
        new obsidian_1.Setting(this.containerEl)
            .setName('Start file')
            .setDesc('Path to the root markdown file')
            .addText(text => text
            .setPlaceholder(DEFAULT_SETTINGS.rootPathFile)
            .setValue(this.plugin.settings.rootPathFile)
            .onChange((v) => __awaiter(this, void 0, void 0, function* () { this.plugin.settings.rootPathFile = v; yield this.plugin.saveSettings(); })));
        new obsidian_1.Setting(this.containerEl)
            .setName('Temp file path')
            .setDesc('Дополнительный файл (temp)')
            .addText(text => text
            .setPlaceholder(DEFAULT_SETTINGS.temp)
            .setValue(this.plugin.settings.temp)
            .onChange((v) => __awaiter(this, void 0, void 0, function* () { this.plugin.settings.temp = v; yield this.plugin.saveSettings(); })));
        new obsidian_1.Setting(this.containerEl)
            .setName('Max root depth')
            .setDesc('0 = no limit')
            .addText(text => text
            .setValue(this.plugin.settings.maxRootDepth.toString())
            .onChange((v) => __awaiter(this, void 0, void 0, function* () { this.plugin.settings.maxRootDepth = parseInt(v) || 0; yield this.plugin.saveSettings(); })));
        // остальные поля...
    }
}
function generateLinkTree(app, cfg) {
    return __awaiter(this, void 0, void 0, function* () {
        const { vault, metadataCache } = app;
        const depthLimit = cfg.maxRootDepth > 0 ? cfg.maxRootDepth : Infinity;
        let rowsCount = 0;
        const visited = new Set();
        const startAbs = vault.getAbstractFileByPath(cfg.rootPathFile);
        if (!(startAbs instanceof obsidian_1.TFile)) {
            new obsidian_1.Notice('Стартовая заметка не найдена: ' + cfg.rootPathFile);
            return;
        }
        const start = startAbs;
        // При необходимости учитываем cfg.temp
        // const tempAbs = vault.getAbstractFileByPath(cfg.temp);
        const backlinksMap = new Map();
        function collect(file) {
            var _a, _b, _c;
            if (backlinksMap.has(file.path))
                return;
            const meta = (_b = (_a = metadataCache).getBacklinksForFile) === null || _b === void 0 ? void 0 : _b.call(_a, file);
            if (!(meta === null || meta === void 0 ? void 0 : meta.data))
                return;
            const set = new Set();
            meta.data.forEach((_, raw) => set.add(raw));
            (_c = meta.unresolved) === null || _c === void 0 ? void 0 : _c.forEach((_, raw) => set.add(raw));
            backlinksMap.set(file.path, set);
        }
        collect(start);
        function buildNode(path, depth, ancestors) {
            var _a;
            if (depth > depthLimit || ancestors.has(path))
                return null;
            if (cfg.only_unique_page && visited.has(path))
                return null;
            if (cfg.only_unique_page)
                visited.add(path);
            if (!backlinksMap.has(path)) {
                const abs = vault.getAbstractFileByPath(path);
                if (abs instanceof obsidian_1.TFile && abs.extension === 'md')
                    collect(abs);
            }
            const refs = (_a = backlinksMap.get(path)) !== null && _a !== void 0 ? _a : new Set();
            const maxWidth = depth === 0 && cfg.rootLimit > 0 ? cfg.rootLimit : cfg.childLimit > 0 ? cfg.childLimit : Infinity;
            const children = [];
            let processed = 0;
            for (const raw of refs) {
                if (processed >= maxWidth)
                    break;
                if (raw === path || ancestors.has(raw))
                    continue;
                const child = buildNode(raw, depth + 1, new Set([...ancestors, path]));
                if (child) {
                    children.push(child);
                    processed++;
                    if (cfg.sizeLimitRows > 0 && rowsCount / 1024 > cfg.sizeLimitRows)
                        break;
                }
            }
            const numChildren = children.length;
            const numGrandchildren = children.reduce((sum, c) => sum + c['number-of-children'], 0);
            const numChildrenAndGrandchildren = numChildren + numGrandchildren;
            // суммарное число всех потомков (каждый ребёнок + его все потомки)
            const totalAllNodes = children.reduce((sum, c) => sum + (c['total-all-nodes'] + 1), 0);
            // Вычисляем name и name-short с учётом целостности слов и "..."
            const rawName = path.split('/').pop() || path;
            const nameNoExt = rawName.replace(/\.[^/.]+$/, '');
            let nameShort = nameNoExt;
            if (cfg.nameMaxLength > 0 && nameNoExt.length > cfg.nameMaxLength) {
                const after = nameNoExt.indexOf(' ', cfg.nameMaxLength);
                const cutIndex = after > 0 ? after : nameNoExt.length;
                nameShort = nameNoExt.slice(0, cutIndex) + '...';
            }
            rowsCount += JSON.stringify({}).length;
            return {
                name: rawName,
                'name-short': nameShort,
                path,
                'number-of-children': numChildren,
                'number-of-grandchildren': numGrandchildren,
                'number-of-children-and-grandchildren': numChildrenAndGrandchildren,
                'total-all-nodes': totalAllNodes,
                children,
            };
        }
        const rootNode = buildNode(start.path, 0, new Set());
        const json = JSON.stringify(rootNode, null, 2);
        let outputPath = 'links.json';
        const adapter = vault.adapter;
        if (adapter instanceof obsidian_1.FileSystemAdapter) {
            const base = adapter.getBasePath();
            outputPath = (0, obsidian_1.normalizePath)(`${base}/.obsidian/plugins/obsidian-linkmap-plugin/visuals/links.json`);
            yield fs_1.promises.writeFile(outputPath, json);
        }
        else {
            yield vault.adapter.write(outputPath, json);
        }
        new obsidian_1.Notice(`links.json создан (${(json.length / 1024).toFixed(1)} KB)` +
            (cfg.sizeLimitRows > 0 && rowsCount / 1024 > cfg.sizeLimitRows ? ' — достигнут лимит' : ''));
    });
}
