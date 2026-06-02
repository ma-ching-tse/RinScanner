# Token Scanner — Figma Plugin

扫描当前 Figma 页面，找出未绑定到 Variables / Paint Styles / Text Styles 的颜色和字体值，并提供一键替换建议。

## 检测范围

- **颜色**：所有 SceneNode 的 `fills` / `strokes` solid paint（跳过已绑定 style 或 variable 的）
- **字体**：所有 TextNode 的 `fontName` / `fontSize` / `lineHeight`（跳过已绑定 text style 的）

合法 token 来源 = 当前文件的 Local Variables + Paint Styles + Text Styles。

## 匹配等级

- **完全匹配**：hex / fingerprint 完全一致 → 一键应用
- **相近匹配**（颜色 ΔRGB ≤ 8）→ 提示后替换
- **部分匹配**（字体仅 family + size 一致）→ 候选列表
- **无匹配**：仅报告

## 开发

```bash
npm install
npm run build
```

然后在 Figma 桌面端 `Plugins → Development → Import plugin from manifest…`，选择此目录的 `manifest.json`。

`npm run watch` 进入监听模式，改完源码无需重启插件，只需在 Figma 里 `Plugins → Development → 重新运行`。

## 项目结构

```
manifest.json          # Figma 插件清单
src/code.ts            # 主线程入口
src/scanner/           # 扫描逻辑
  loadTokens.ts        #   构建 token 索引（hex + fingerprint）
  walkNodes.ts         #   遍历 currentPage
  checkColor.ts        #   fill / stroke 检测
  checkText.ts         #   字体属性检测
src/fixer/applyFix.ts  # 应用 token 的实现
src/ui/                # iframe 面板
  main.ts              #   渲染 + 消息处理
  styles.css           #   样式（继承 Figma 主题色）
scripts/build-html.js  # 把 ui.js + styles.css 内联进 ui.html
```

## 组件实例的处理

按「值在哪里被创作，就在哪里检测」的原则分三种：

- **设计系统库组件 → 整体跳过**：实例的主组件来自外部库（`mainComponent.remote === true`）时，连同内部所有图层一起跳过，包括手动 override —— 因为这些组件在库文件里画的时候已经 token 化，是库的职责。无需维护任何名单，库里加新组件自动覆盖。
- **本地组件实例 → 只检测 override**：主组件是当前文件本地画的（`remote === false`）时，继承值不标（本地主组件本身会被单独扫到），只检测设计师手动覆盖过的属性。判定依据 `InstanceNode.overrides`。
- **额外白名单（可选）**：「额外忽略的组件」面板可手动按组件名忽略本地组件等特例，存在 `figma.clientStorage`（本机本账号，跨文件通用）。

> 前提：订阅的库都是自己 token 化过的 DS 库；若引入未 token 化的第三方 UI kit，其组件也会被一并跳过。

## 规范检查维度

主界面顶部「扫描」开关可多选要检测的维度（至少留一个，记忆在 clientStorage）：

- **Token**：颜色（fill/stroke）+ 字体，对照 BMDS token。
- **布局 (auto-layout)**：硬规则检测 —— 用了 Group、或 Frame 有多个子元素却没 auto-layout。**仅检测 + 定位**（自动修复效果不稳定，已搁置）。
- **命名**：先用正则抓默认名（`Frame 427` 等）；再可选接 LLM 给语义化建议并一键改名。

## LLM 命名（实验）

- 在「⚙ LLM 命名设置」里填 **代理地址 / 模型 / API Key**（OpenAI 兼容 `/chat/completions`，Qwen DashScope compatible-mode 可用；代理自带 key 时可留空）。配置存本机 `clientStorage`。
- 命名分组点「✨ AI 命名建议」→ 把每个图层的**类型、当前名、父层名、内部文字**批量发给模型 → 返回 PascalCase 建议 → 每条可「改名」一键应用（`node.name`）。不发送截图（多模态留作后续）。
- `manifest.json` 的 `networkAccess.allowedDomains` 现为 `["*"]` 以支持可配置端点；如需收紧，改成你们代理的固定域名即可。

## 已知限制

- 嵌套实例的 override 判定以顶层 `overrides` 为准，深层嵌套可能漏判（偏向少报，不会误报）
- 不检测 spacing / radius / effect
- 混合字体 (`figma.mixed`) 仅标记为「需要人工处理」，不推荐自动修复
- 颜色 token 来自 `src/tokens/bmds.ts`（写死）；字体仍读当前文件的 Local Text Styles
