# 🎨 RinScanner 插件 · 安装指南

> 一款 Figma 设计规范检查插件:一键扫描画板,自动找出未绑定 token 的颜色/字体、不规范布局、默认命名,并支持一键修复。
> 安装只需 1 分钟,**无需任何配置**。

---

## ⚠️ 开始前(重要)

请使用 **Figma 桌面端 App**(不是浏览器网页版)——网页版无法导入开发插件。
👉 没装的话先到 [figma.com/downloads](https://www.figma.com/downloads/) 下载安装。

---

## 📥 安装步骤

### ① 解压安装包
把收到的 **`RinScanner-plugin.zip`** 解压,得到一个 **`RinScanner` 文件夹**。

> 💡 把这个文件夹放在一个**固定、不会误删**的位置(比如「文档」里),Figma 之后会一直读取它。

`[截图位置:解压后的 RinScanner 文件夹]`

---

### ② 打开导入菜单
打开 Figma 桌面端,顶部菜单点击:

**`Plugins`(插件) → `Development`(开发) → `Import plugin from manifest…`(从清单导入插件)**

`[截图位置:Plugins → Development → Import plugin from manifest 菜单]`

---

### ③ 选择 manifest.json
在弹出的文件选择框里,进入刚才的 `RinScanner` 文件夹,选中 **`manifest.json`** 这个文件,点「打开」。

`[截图位置:选中 manifest.json]`

---

### ④ 完成 ✅
导入成功后,即可在以下位置找到并运行插件:

**`Plugins`(插件) → `Development`(开发) → `RinScanner`**

`[截图位置:Plugins 菜单里出现 RinScanner]`

---

## 🚀 怎么用

1. 在画布上**选中**一个或多个画板 / 节点
2. 运行 **RinScanner**
3. 点 **「扫描」**
4. 对扫出的问题,逐个点 **「应用 token」/「改名」** 修复
5. (可选)在设置 ⚙ 里填入 LLM API Key,即可使用 **AI 智能命名**

---

## ❓ 常见问题

- **菜单里没有 "Import plugin from manifest"?**
  → 你用的是网页版。请改用 **Figma 桌面端 App**。

- **插件运行后没反应 / 提示选中画板?**
  → 先在画布上选中一个画板再点「扫描」。

- **换了电脑 / 移动了文件夹后插件不见了?**
  → 重新做一次第 ② ③ 步导入即可(Figma 直接读取文件夹位置)。

---

有任何问题,联系 **Ringo** 🙌
