# Quick Reply Bindings

Quick Reply Bindings 是一个 SillyTavern 第三方扩展，用于把“当前正在编辑的快速回复集”与世界书、预设绑定。

## 功能

- 在“扩展 -> 快速回复 -> 编辑快速回复”区域显示一套绑定工具栏。
- 为当前选择的快速回复集绑定一个或多个世界书。
- 为当前选择的快速回复集绑定一个或多个预设。
- 当已启用的世界书或当前激活预设命中绑定时，自动启用并显示对应快速回复集。
- 当世界书/预设不再命中绑定时，自动移除对应快速回复集。
- 选择世界书和预设时支持搜索。

## 必要依赖

使用本扩展前，必须先安装并启用以下扩展：

1. SillyTavern 内置 Quick Replies 扩展。
2. [st-api-wrapper](https://github.com/Lianues/st-api-wrapper)。

本扩展通过 `window.ST_API.worldBook.*` 和 `window.ST_API.preset.*` 读取世界书与预设列表，因此没有安装并启用 st-api-wrapper 时无法正常使用。依赖扩展的目录名必须是 `st-api-wrapper`，这样 SillyTavern 才能匹配到 manifest 里的 `third-party/st-api-wrapper` 依赖。

## 安装

推荐在 SillyTavern 里安装：

1. 打开“扩展”。
2. 打开“安装扩展”。
3. 粘贴仓库地址：

   ```text
   https://github.com/pingzeshi/st-qr-bindings
   ```

4. 如果界面有分支输入框，留空或填写 `main`。
5. 安装后在“管理扩展”中启用 `Quick Reply Bindings`。

也可以手动安装，把本仓库 clone 到 SillyTavern 的全局第三方扩展目录：

```text
public/scripts/extensions/third-party/st-qr-bindings
```

刷新 SillyTavern 后，在扩展管理中启用 `Quick Reply Bindings`。

## 安装失败排查

- 先安装并启用 `st-api-wrapper`，再启用本扩展。
- 确认 st-api-wrapper 的目录名是 `st-api-wrapper`，不是 `st-api-wrapper-main` 或其他名字。
- 如果 SillyTavern 提示目录已存在，先在“管理扩展”里删除旧的 `st-qr-bindings`，或手动删除对应扩展目录后再安装。
- 如果使用 `.git` 地址失败，改用不带 `.git` 的仓库主页地址：`https://github.com/pingzeshi/st-qr-bindings`。
- SillyTavern 安装第三方扩展需要服务端能运行 `git` 并访问 GitHub。

## 使用方法

1. 打开 SillyTavern。
2. 进入“扩展”。
3. 打开“快速回复”。
4. 下滑到“编辑快速回复”。
5. 在下拉框中选择要绑定的快速回复集。
6. 使用工具栏中的：
   - “绑定世界书”
   - “绑定预设”
   - “清除绑定”

绑定状态会显示在工具栏左侧。

## 依赖与许可证说明

本项目依赖 [st-api-wrapper](https://github.com/Lianues/st-api-wrapper) 提供的公开运行时 API，但不包含、不复制、不修改 st-api-wrapper 的源码。

核对结果：截至本 README 编写时，本地 clone 与 GitHub 页面中未发现 st-api-wrapper 声明 LICENSE 文件，`package.json` 中也未声明 `license` 字段。因此，本项目只声明自身源码的许可证，不代表 st-api-wrapper 的许可证状态。

## License

本项目使用 MIT License。详见 [LICENSE](./LICENSE)。
