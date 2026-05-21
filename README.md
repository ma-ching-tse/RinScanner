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

## 已知限制

- 不下钻到 component instance 内部子节点（按设计：只检测 instance override）
- 不检测 spacing / radius / effect
- 混合字体 (`figma.mixed`) 仅标记为「需要人工处理」，不推荐自动修复
- 只读 Local Variables / Styles；订阅自外部 library 的 token 需在文件中已可用才会被识别
