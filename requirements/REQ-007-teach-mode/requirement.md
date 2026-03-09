# REQ-007: 用户演示教学模式 (Teach Mode)

## Summary

当 AI 无法识别目标元素或不知道下一步该做什么时，用户可以切换到"演示模式"，亲自在页面上操作（点击、输入、滚动等）。扩展会录制这些操作，并将操作序列作为上下文反馈给
AI，让 AI 从演示中学习并继续完成任务。录制结果可本地持久化保存、复制导出、手动编辑，做到录一次反复用。

## Problem Analysis

### 现象

- AI 识别不到某个按钮（DOM extractor 没捞到、或元素描述不够明确导致 AI 选错）
- 页面交互流程复杂（多级菜单、hover 展开、拖拽），AI 不知道操作路径
- 用户清楚该怎么做，但没法"告诉" AI 该点哪里
- 同一个网站的操作模式是固定的，但每次都要重新教，很浪费

### 核心诉求

用户能用"做一遍给你看"的方式教会 AI，而不是只能靠文字描述。录制结果可以保存、导出、复用。

## Requirements

### A. 录制能力 (Action Recording)

1. content script 中新增录制模块，监听页面上的用户真实操作：
    - **click**：记录被点击元素的 tag、文本、id、class、aria-label、在页面中的位置描述
    - **input/change**：记录输入的目标元素 + 输入的值
    - **scroll**：记录滚动方向和大致距离
    - **导航**：记录 URL 变化（`popstate` / `hashchange` / 页面跳转）
2. 每条记录包含时间戳（相对于录制开始的偏移毫秒数）
3. 自动采集被操作元素的上下文信息：
    - 元素自身：tag、textContent（截取前 60 字符）、id、aria-label、role、placeholder
    - 祖先上下文：最近的 heading 或 section 名称（复用 `getElementContext` 逻辑）
4. 录制不阻断用户的正常操作——纯监听，不 `preventDefault`
5. 排除对 ChromePilot 自身 UI（`#chromepilot-root`、sidepanel）的操作

### B. 演示模式交互流 (Teach Mode UX)

1. 侧边栏新增"Teach"按钮（🎓图标），位于工具栏区域
2. 交互流程：
    - **进入演示模式**：用户点击 Teach 按钮 → 按钮高亮为激活态 → 侧边栏显示提示 "Recording your actions... Click Teach
      again when done."
    - **录制中**：用户在页面上正常操作，每个操作实时显示在侧边栏消息区（如 `🔴 Clicked: "确认" button`、
      `🔴 Typed: "hello" in search input`）
    - **结束录制**：用户再次点击 Teach 按钮 → 录制停止 → 操作序列汇总显示，带"Copy"和"Save"按钮
3. 使用场景：**独立使用**（先录制 → 发指令，AI 带着录制上下文执行）
4. ⚠ **暂不支持任务中途接管**：当前 Stop 会清除 `conversationHistory`，中途演示后说"继续"
   无法衔接上下文。中途接管需要先解决历史保留问题，作为后续迭代。当前版本 Teach 仅在无任务运行时可用（任务运行中 Teach 按钮置灰）

### C. 录制数据格式 (Recording Format)

```json
{
  "type": "user_demonstration",
  "name": "Habitica - 给力量加点",
  "url": "https://habitica.com/profile/*",
  "createdAt": "2026-03-09T12:00:00Z",
  "actions": [
    {
      "action": "click",
      "timestamp": 0,
      "element": {
        "tag": "button",
        "text": "确认删除",
        "id": "confirm-btn",
        "ariaLabel": "",
        "role": "button",
        "context": "删除确认弹窗"
      }
    },
    {
      "action": "type",
      "timestamp": 1200,
      "value": "hello world",
      "element": {
        "tag": "input",
        "text": "",
        "id": "search-input",
        "placeholder": "Search...",
        "context": "Header"
      }
    },
    {
      "action": "scroll",
      "timestamp": 2500,
      "direction": "down",
      "amount": 600
    }
  ]
}
```

### D. 本地持久化与导出 (Save & Export)

1. **自动保存**：录制结束后，自动存入 `chrome.storage.local`，key 为 `recordings`（数组）
2. **命名**：录制结束时弹出简单的命名输入（默认值：`{页面标题} - {当前时间}`），用户可修改
3. **URL 关联**：每条录制记录保存当前页面的 URL pattern（域名 + 路径，用于后续匹配推荐）
4. **管理列表**：侧边栏 Teach 按钮长按（或旁边加一个下拉箭头）打开录制管理面板：
    - 列出所有已保存的录制，按时间倒序
    - 每条显示：名称、URL、操作数量、时间
    - 操作：**引用**（将录制注入到当前对话上下文）、**复制 JSON**、**删除**
5. **复制导出**：
    - 录制汇总区域和管理列表中都有"Copy"按钮
    - 复制的是完整的 JSON 格式（上面 C 节的格式），可以粘贴到文本编辑器里手动修改
    - 用户修改后可以粘贴回输入框，以 JSON 开头的消息自动识别为录制数据并解析
6. **导入**：用户在输入框粘贴 `{"type":"user_demonstration",...}` 格式的 JSON，系统自动识别为录制数据，解析后作为当前对话的演示上下文

### E. 与 LLM 对接 (LLM Integration)

1. 当对话中存在演示记录时（刚录制的、或从保存列表中引用的），作为 user message 注入 `buildMessages`，格式如：
   ```
   The user provided a demonstration of the correct workflow:
   1. Clicked: "确认删除" button (in: 删除确认弹窗)
   2. Typed: "hello world" in <input placeholder="Search..."> (in: Header)
   3. Scrolled down ~600px
   Follow this demonstration to complete the task.
   ```
2. 如果用户在演示后输入了新指令，演示记录附加在该指令之前
3. 如果用户从保存列表中"引用"了一条录制，等效于刚录完——下一次发指令时 AI 能看到

### F. 页面视觉反馈 (Visual Feedback)

1. 录制模式激活时，页面顶部显示一条醒目的红色录制指示条（类似屏幕录制的红条）：`🔴 ChromePilot is recording your actions`
2. 每次捕获到操作时，被操作的元素短暂高亮闪烁（绿色边框，300ms），确认操作被记录
3. 录制结束时指示条消失

## Message Flow

```
[User clicks Teach]
  → sidepanel → service-worker (START_RECORDING) → content-script: 注册事件监听

[User operates on page]
  → content-script 捕获操作 → service-worker (RECORD_ACTION) → sidepanel 实时显示

[User clicks Teach again]
  → sidepanel → service-worker (STOP_RECORDING) → content-script: 移除监听
  → sidepanel 显示汇总 + 命名输入
  → 用户确认 → 存入 chrome.storage.local

[User types command]
  → service-worker 在 buildMessages 中注入演示记录 → LLM 看到上下文

[User clicks "引用" on a saved recording]
  → 从 chrome.storage.local 读取 → 设为当前演示上下文 → 等待用户发指令
```

## Affected Files

| File                               | Change                                           |
|------------------------------------|--------------------------------------------------|
| `src/content/action-recorder.js`   | **新建** — 录制模块：事件监听、操作捕获、元素信息采集、录制指示条             |
| `src/content/content-script.js`    | 新增 `START_RECORDING` / `STOP_RECORDING` / 录制事件转发 |
| `src/background/service-worker.js` | 新增录制状态管理、`RECORD_ACTION` 处理、录制数据存储与读取            |
| `src/background/llm-client.js`     | `buildMessages` 支持演示记录的格式化注入                     |
| `src/sidepanel/sidepanel.html`     | 新增 Teach 按钮                                      |
| `src/sidepanel/sidepanel.js`       | Teach 按钮逻辑、实时录制显示、录制管理面板、JSON 粘贴识别               |
| `src/sidepanel/sidepanel.css`      | Teach 按钮样式、录制态样式、管理面板样式                          |
| `src/manifest.json`                | content_scripts 中注册 `action-recorder.js`         |

## Acceptance Criteria

- [ ] 点击 Teach 按钮后进入录制模式，按钮显示激活态
- [ ] 任务运行中 Teach 按钮置灰不可用
- [ ] 录制模式下，click / input / scroll 操作被捕获并实时显示
- [ ] 对 ChromePilot 自身 UI 的操作不被录制
- [ ] 再次点击 Teach 结束录制，显示操作汇总 + 命名输入
- [ ] 录制结果自动保存到 `chrome.storage.local`
- [ ] 录制管理面板能列出所有已保存的录制
- [ ] 点击"引用"能将录制设为当前对话上下文
- [ ] 点击"Copy"能将完整 JSON 复制到剪贴板
- [ ] 在输入框粘贴 JSON 格式的录制数据能被自动识别并解析
- [ ] 录制后发送指令，AI 能看到演示操作作为上下文
- [ ] 录制模式下页面顶部有红色录制指示条
- [ ] 被捕获的元素有短暂绿色高亮反馈
- [ ] 保存的录制可以删除
