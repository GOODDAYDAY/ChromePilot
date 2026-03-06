# REQ-004: Open Web — Navigation, Global Panel & Multi-step Operations

## Summary

Enhance ChromePilot with URL navigation, a persistent global side panel, multi-step task execution, and intelligent
result extraction.

## Requirements

### A. URL Navigation (navigate action)

1. 新增 `navigate` action 类型，LLM 可以返回 `{"action": "navigate", "url": "https://..."}`
2. 用户可以说 "打开百度"、"访问 https://www.google.com"、"去 YouTube" 等命令
3. URL 识别由 LLM 智能处理：直接 URL、常见网站名称都能识别
4. 打开方式：默认**新标签页**打开；面板顶部增加 "当前页跳转" 开关（默认关闭）
5. 开关状态持久化到 `chrome.storage.sync`

### B. 全局侧边栏 (Global Side Panel)

1. 侧边栏是全局固定的，切换标签页后依然保留，不需要每个页面重新打开
2. 使用 Chrome 原生 `chrome.sidePanel` API（MV3，Chrome 114+）替代当前的 Shadow DOM 注入方式
3. 聊天记录在切换标签页后保留
4. 点击扩展图标时打开/关闭侧边栏
5. 保留现有 UI 设计风格（REQ-003 的视觉规范）

### C. 多步连续操作 (Multi-step Execution)

1. 支持连续多步操作：执行完一组 actions 后，如果任务未完成，自动重新提取 DOM 并再次询问 LLM
2. LLM 可返回 `"done": true` 表示任务完成，或 `"done": false` 表示还需要继续
3. 每步执行结果反馈给 LLM 作为上下文，维持对话历史（仅保留最近 3 轮以节省 token）
4. 最大步数可配置：侧边栏提供下拉选择（5/10/20/50/Unlimited），默认 10 步
5. 用户可以随时点击 Stop 按钮中断正在执行的多步任务
6. 同一步内的多个 actions 逐个顺序执行，不并发
7. 操作间隔可配置：侧边栏提供下拉选择（0s/0.1s/0.2s/0.5s/1s/2s/3s/5s），默认 0.5s
8. LLM 应尽量批量返回 actions（如 "点完所有 checkbox" 应一次返回全部 click），减少轮次

### D. 智能结果提取 (Read Action & Smart Summary)

1. 新增 `read` action 类型，LLM 可读取页面元素的文本内容
2. 查询/翻译/搜索类任务，结果可见后 LLM 应立即停止，将答案写入 `summary` 返回给用户
3. `summary` 字段直接展示给用户，应包含实际结果（如 "翻译结果: surprise"）

### E. Token 限制防护

1. DOM 元素上限 150 个（从 500 缩减），去掉 class 属性输出以节省 token
2. DOM 上下文超过 12000 字符时自动截断
3. 对话历史仅保留最近 3 轮

## Acceptance Criteria

- [x] 用户说 "打开百度" → 在新标签页打开 baidu.com
- [x] "当前页跳转" 开关状态持久化
- [x] 切换标签页后侧边栏依然存在，聊天记录保留
- [x] 点击扩展图标可以打开/关闭侧边栏
- [x] 多步执行过程中显示进度状态（Step N / Max）
- [x] 最大步数可配置，支持 Unlimited
- [x] 操作间隔可配置
- [x] 用户可以中途取消多步任务（Stop 按钮）
- [x] 翻译/查询任务完成后 LLM 自动停止并返回结果
- [x] `read` action 可提取页面元素文本
- [x] 大页面不会触发 token 超限错误
