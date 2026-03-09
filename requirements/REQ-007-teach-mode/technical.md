# Technical Design: 用户演示教学模式 (Teach Mode)

Requirement: REQ-007
Date: 2026-03-09
Status: Proposed

## 1. Overview

新增"演示教学模式"：用户可以在页面上亲自操作（点击、输入、滚动），扩展录制操作序列，作为上下文注入 LLM，让 AI
从演示中学习。录制结果可持久化保存、导出 JSON、粘贴导入、反复引用。

### 方案选型

**方案 1: 录制逻辑内联到 content-script.js**

- 所有事件监听、元素信息采集、录制指示条渲染都写在 content-script.js 中
- ✅ 无需新文件，无需修改 manifest
- ❌ content-script.js 膨胀严重（目前 42 行，录制模块至少 200+ 行），职责混乱

**方案 2: 独立 action-recorder.js 模块** ← 采用

- 新建 `src/content/action-recorder.js`，负责录制逻辑、UI 反馈、元素信息采集
- content-script.js 仅转发 START/STOP_RECORDING 消息
- ✅ 职责清晰，复用 dom-extractor.js 的 `getElementContext`/`getElementText` 全局函数
- ❌ 需要在 manifest.json 和 `ensureContentScripts()` 中注册新文件

采用方案 2。`action-recorder.js` 在 manifest 中排在 `dom-extractor.js` 之后加载，可直接调用全局函数。

## 2. Data Flow

```
A. 开始录制:
   SidePanel [Teach btn] → SW (START_RECORDING) → content-script → action-recorder: startRecording()
   → 注册 click/input/scroll/popstate 监听 → 页面顶部显示红色录制条

B. 录制中:
   用户操作页面 → action-recorder 捕获事件 → 采集元素信息 → 绿色高亮闪烁
   → chrome.runtime.sendMessage → SW (RECORD_ACTION) → SidePanel 实时显示

C. 结束录制:
   SidePanel [Teach btn again] → SW (STOP_RECORDING) → content-script → action-recorder: stopRecording()
   → 移除监听 → 移除录制条 → 返回 actions 数组
   → SidePanel 显示汇总 + 命名输入 → 用户确认 → SW (SAVE_RECORDING) → chrome.storage.local

D. 使用录制:
   用户发指令 → SW 在 buildMessages 中注入 demonstrationContext → LLM 看到演示上下文

E. 引用已保存录制:
   SidePanel 管理面板 → 选择录制 → 设为 currentDemonstration → 等待用户发指令

F. JSON 粘贴导入:
   用户在输入框粘贴 JSON → SidePanel 检测 {"type":"user_demonstration",...}
   → 解析并设为 currentDemonstration → 提示用户
```

## 3. Detailed Design

### 3.1 新建文件: `src/content/action-recorder.js`

录制模块，在 manifest 中排在 `dom-extractor.js` 之后加载，可直接调用 `getElementContext()`、`getElementText()`
等全局函数。

**模块级状态:**

```javascript
let isRecording = false;
let recordedActions = [];
let recordingStartTime = 0;
let recordingIndicatorEl = null;

// 事件处理函数引用（用于移除监听）
let clickHandler = null;
let inputHandler = null;
let scrollHandler = null;
let scrollTimer = null;
let popstateHandler = null;
let hashchangeHandler = null;
```

**核心函数:**

```javascript
// 判断元素是否属于 ChromePilot 自身 UI
function isChromePilotElement(el)

// 采集被操作元素的信息，复用 dom-extractor.js 的全局函数
// 返回 { tag, text, id, ariaLabel, role, placeholder, context }
function captureElementInfo(el)

// 发送录制动作到 service worker
function emitRecordAction(actionData)

// 被操作元素绿色高亮闪烁 300ms
function showCaptureFlash(el)

// 显示/移除页面顶部红色录制指示条
function showRecordingIndicator()
function removeRecordingIndicator()

// 开始录制 — 注册所有事件监听
function startRecording()

// 停止录制 — 移除所有监听，返回 { success, recording }
function stopRecording()

// 查询当前是否在录制
function isCurrentlyRecording()
```

**事件监听策略:**

| 事件         | 监听方式                                       | 节流/防抖    | 说明                                     |
|------------|--------------------------------------------|----------|----------------------------------------|
| click      | `document.addEventListener(capture: true)` | 无        | capture phase 防止被框架 stopPropagation 阻断 |
| change     | `document.addEventListener(capture: true)` | 无        | 用 change 而非 input，输入完成时才触发一次           |
| scroll     | `window.addEventListener(capture: true)`   | 500ms 节流 | 合并连续滚动，忽略 <50px 微小滚动                   |
| popstate   | `window.addEventListener`                  | 无        | SPA 后退/前进                              |
| hashchange | `window.addEventListener`                  | 无        | hash 路由变化                              |

**视觉反馈:**

- 红色录制指示条：`position: fixed; top: 0; z-index: 2147483647;` 高 32px，不可交互（pointer-events: none）
- 绿色高亮闪烁：`position: fixed` 叠在被操作元素上，`border: 3px solid #22c55e`，300ms 后 fade out

### 3.2 修改: `src/content/content-script.js`

新增三个 message handler 到现有 switch 语句中：

```javascript
case 'START_RECORDING':
    sendResponse(startRecording());
    break;

case 'STOP_RECORDING':
    sendResponse(stopRecording());
    break;

case 'IS_RECORDING':
    sendResponse({ success: true, recording: isCurrentlyRecording() });
    break;
```

`RECORD_ACTION` 不需要在此处理——由 `action-recorder.js` 通过 `chrome.runtime.sendMessage` 直接发往 SW。

### 3.3 修改: `src/background/service-worker.js`

**新增状态:**

```javascript
let recordingTabId = null;  // 当前录制的 tab ID
```

**新增 6 个 message handler:**

| Message Type     | 处理逻辑                                                                  |
|------------------|-----------------------------------------------------------------------|
| START_RECORDING  | 获取 activeTab → ensureContentScripts → 转发到 content → 记录 recordingTabId |
| STOP_RECORDING   | 转发到 recordingTabId 的 content → 清除 recordingTabId → 返回 recording       |
| RECORD_ACTION    | 转发到 sidepanel 实时显示                                                    |
| SAVE_RECORDING   | 存入 chrome.storage.local（`recordings` 数组，unshift 最新到前面，上限 50 条）        |
| GET_RECORDINGS   | 从 chrome.storage.local 读取 recordings 数组                               |
| DELETE_RECORDING | 从 recordings 数组按 index 删除                                             |

**修改 `handleExecuteCommand`:**

签名扩展为 `handleExecuteCommand(command, demonstrationContext = null)`，将 demonstrationContext 传递给
callLLM。

**修改 `ensureContentScripts`:**

注入列表增加 `content/action-recorder.js`（在 dom-extractor.js 之后、action-executor.js 之前）。

**修改 CANCEL_TASK:**

如果正在录制，一并停止。

### 3.4 修改: `src/background/llm-client.js`

**签名扩展:**

```javascript
export async function callLLM(config, command, domContext, history, signal, demonstrationContext = null)
function buildMessages(command, domContext, history, demonstrationContext = null)
```

**新增 `formatDemonstration(demonstration)`:**

将录制的动作序列格式化为人类可读文本：

```
The user provided a demonstration of the correct workflow:
1. Clicked: "确认删除" button (in: 删除确认弹窗)
2. Typed: "hello world" in <input placeholder="Search..."> (in: Header)
3. Scrolled down ~600px
Follow this demonstration to complete the task.
```

**buildMessages 修改:**

如果 demonstrationContext 存在，将 `formatDemonstration()` 的输出插入到第一条 user message 的 command 之前。

### 3.5 修改: Sidepanel

#### HTML 新增

工具栏区域新增两个按钮：

```html
<button class="header-btn" id="teachBtn" title="Teach mode: record your actions">&#127891;</button>
<button class="header-btn" id="recordingsBtn" title="Manage saved recordings">&#9660;</button>
```

messages 区域后新增录制管理面板（默认 hidden）：

```html
<div class="recordings-panel hidden" id="recordingsPanel">
    <div class="recordings-header">...</div>
    <div class="recordings-list" id="recordingsList"></div>
</div>
```

#### JS 新增状态

```javascript
let recording = false;           // 是否正在录制
let currentDemonstration = null; // 当前活跃的演示上下文
let pendingRecording = null;     // 等待命名保存的录制数据
```

#### JS 核心逻辑

| 功能            | 实现                                                                      |
|---------------|-------------------------------------------------------------------------|
| Teach 按钮切换    | 点击切换录制状态，激活态红色脉冲动画，任务运行中 disabled                                       |
| 实时录制显示        | 监听 `RECORD_ACTION` 消息，`addMessage('recording', ...)` 红色背景实时显示每条动作       |
| 录制汇总 + 命名     | 录制结束后动态创建汇总 DOM：操作列表 + 命名输入框 + Save & Use / Copy JSON / Discard 三个按钮    |
| 管理面板          | 从 `chrome.storage.local` 加载列表，每条带 Use（引用）/ Copy（复制 JSON）/ ✗（删除）按钮       |
| JSON 粘贴检测     | `inputEl` 的 paste 事件中 `setTimeout(0)` 异步检测，前缀匹配 + JSON.parse，成功则设为演示上下文 |
| handleSend 修改 | 发送时如果 `currentDemonstration` 存在，附加到 message 中，使用后清除（一次性）                |
| setRunning 修改 | `teachBtn.disabled = isRunning`                                         |

#### CSS 新增

- Teach 按钮录制态：红色背景 + 1.5s 脉冲动画
- 录制消息样式：浅红背景 `#fef2f2`、红色文字
- 录制汇总：操作列表 + 命名输入 + 按钮行
- 管理面板：绝对定位浮层，max-height 60vh 可滚动

### 3.6 修改: `src/manifest.json`

content_scripts.js 数组增加 `content/action-recorder.js`：

```json
["lib/utils.js", "content/dom-extractor.js", "content/action-recorder.js", "content/action-executor.js", "content/content-script.js"]
```

### 3.7 Storage Schema

**`chrome.storage.local` — `recordings` key:**

```
recordings: Recording[]      // 按时间倒序，最多 50 条

Recording {
    type: 'user_demonstration'
    name: string              // 用户命名
    url: string               // 录制时页面 URL
    createdAt: string         // ISO 8601
    actions: RecordedAction[]
}

RecordedAction {
    action: 'click' | 'type' | 'scroll' | 'navigate'
    timestamp: number         // 相对偏移 ms
    element?: { tag, text, id, ariaLabel, role, placeholder, context }
    value?: string            // type 的输入值
    direction?: string        // scroll 方向
    amount?: number           // scroll 像素
    url?: string              // navigate 目标
}
```

### 3.8 Message Types

| Message          | From      | To           | Payload                              |
|------------------|-----------|--------------|--------------------------------------|
| START_RECORDING  | SidePanel | SW           | (none)                               |
| START_RECORDING  | SW        | Content      | (none)                               |
| STOP_RECORDING   | SidePanel | SW           | (none)                               |
| STOP_RECORDING   | SW        | Content      | (none)                               |
| RECORD_ACTION    | Content   | SW           | `{ action: RecordedAction }`         |
| RECORD_ACTION    | SW        | SidePanel    | `{ action: RecordedAction }`         |
| SAVE_RECORDING   | SidePanel | SW           | `{ recording: Recording }`           |
| GET_RECORDINGS   | SidePanel | SW           | (none)                               |
| DELETE_RECORDING | SidePanel | SW           | `{ index: number }`                  |
| EXECUTE_COMMAND  | SidePanel | SW           | `{ command, demonstrationContext? }` |
| IS_RECORDING     | SidePanel | SW → Content | (none)                               |

## 4. Implementation Steps

1. **action-recorder.js 核心** — 创建新文件，实现全部录制函数
2. **manifest 注册** — content_scripts 添加 action-recorder.js
3. **content-script.js 消息** — 添加 START/STOP_RECORDING、IS_RECORDING handler
4. **service-worker 录制管理** — 录制状态、6 个新 message handler、ensureContentScripts 更新（依赖 1-3）
5. **llm-client 演示注入** — 扩展签名、新增 formatDemonstration()（独立于 1-4）
6. **service-worker EXECUTE_COMMAND 修改** — 接受 demonstrationContext 传递给 callLLM（依赖 5）
7. **sidepanel — Teach 按钮 + 实时显示**（依赖 4）
8. **sidepanel — 录制汇总 + 命名**（依赖 7）
9. **sidepanel — 管理面板**（依赖 4）
10. **sidepanel — JSON 粘贴 + handleSend 修改**（依赖 5-6）

并行路径：step 1-4（录制核心链路）与 step 5（LLM 集成）可并行。step 7-10 在 4+5 后进行。

## 5. Risk & Mitigation

| Risk                                     | Mitigation                                          |
|------------------------------------------|-----------------------------------------------------|
| click 被框架 `stopPropagation` 阻断           | capture phase 监听                                    |
| scroll 事件过于频繁                            | 500ms 节流 + 忽略 <50px                                 |
| storage 空间溢出                             | 限制最多 50 条录制                                         |
| `getElementContext`/`getElementText` 未加载 | manifest 加载顺序保证                                     |
| 演示上下文占用过多 token                          | formatDemonstration 输出简洁文本，非 JSON                   |
| SPA pushState 无法监听                       | pushState 导航由 click 驱动（已捕获），URL 在 recording.url 中体现 |
| 粘贴超长 JSON 卡顿                             | setTimeout(0) 异步检测，解析失败忽略                           |
