# REQ-005: Debug Overlay, True Stop & Input Auto-resize

## Summary

Three improvements: visual debug overlay for DOM extractor, reliable task cancellation, and auto-resizing input field.

## Requirements

### A. DOM 可视化调试 (Debug Overlay)

1. 侧边栏增加一个 "Show Elements" 按钮/开关
2. 开启后，在页面上高亮显示所有被 DOM extractor 检测到的交互元素
3. 每个元素旁边显示对应的编号标签（如 `[1]` `[2]`），与发送给 LLM 的编号一致
4. 高亮样式：半透明彩色边框 + 编号浮标，不影响页面交互
5. 再次点击或关闭面板时移除所有高亮
6. 滚动页面时高亮标签跟随元素位置实时更新

### B. 真正的 Stop (True Cancel)

1. 点击 Stop 后，必须立即终止所有正在进行的操作：
    - 终止正在进行的 LLM API 请求（abort fetch）
    - 终止正在执行的 content script actions（包括 repeat 循环）
    - 终止多步循环
2. Stop 后立即恢复输入状态（Send 按钮可用、输入框可输入）
3. 不能再继续执行之前未完成的操作

### C. DOM 检测降噪优化 (Extractor Noise Reduction)

1. 过滤 SVG 元素（几乎都是图标，对 LLM 无意义）
2. 过滤空 div/span（无文本、无 aria-label、无 id、无 role 的装饰性元素）
3. 父子去重：子元素的祖先已是可交互元素时，跳过子元素
4. `[tabindex]` 收紧为 `[tabindex="0"]`，不再捕获 `tabindex="-1"` 的装饰元素
5. 侧边栏增加 "Copy DOM" 按钮，一键复制检测到的元素列表到剪贴板，方便调试
6. MAX_ELEMENTS 上限可在 Options 页面配置（输入框），默认 150

### D. 输入框自适应高度 (Auto-resize Input)

1. 输入框改为 `<textarea>`，支持多行输入
2. 随内容自动增高，最小 1 行，最大不超过 5 行（约 120px）
3. 超过最大高度后出现滚动条
4. Enter 发送，Shift+Enter 换行

## Acceptance Criteria

- [ ] 点击 Show Elements 后页面上所有检测到的元素显示编号标签
- [ ] 再次点击 Show Elements 后高亮消失
- [ ] 点击 Stop 后 LLM 请求立即中断
- [ ] 点击 Stop 后 repeat 循环立即停止
- [ ] Stop 后面板立即恢复可输入状态
- [ ] 输入框随内容自动增高，最多 5 行
- [ ] Enter 发送消息，Shift+Enter 换行
- [ ] 复杂页面（如 Habitica）噪音元素被过滤，150 个名额能覆盖页面全部区域
- [ ] Copy DOM 按钮可将检测到的元素列表复制到剪贴板
- [ ] 滚动页面时 Debug Overlay 标签跟随元素实时移动
- [ ] Options 页面可配置最大元素数量，输入后保存生效
