# REQ-006: 弹窗感知与优先交互 (Dialog Awareness)

## Summary

当前 DOM 提取对弹窗（Modal / Dialog）支持极差——弹窗内的按钮经常识别不到，导致 AI 无法操作弹窗。根因是元素按 DOM 顺序取前 150
个，弹窗在 DOM 末尾被截断，且背景被遮罩挡住的元素仍占名额。本需求实现弹窗检测、弹窗元素优先提取、弹窗内宽松过滤三项能力。

## Problem Analysis

### 现象

- 页面弹出 Modal/Dialog 后，弹窗内的按钮（如 Habitica Stats 弹窗的加点按钮）不出现在元素列表中
- AI 看不到弹窗按钮，无法完成用户的操作意图

### 根因

1. **DOM 顺序 + maxElements 截断**：弹窗通常 append 在 `<body>` 末尾，页面主体元素已占满 150 个名额，弹窗按钮轮不到
2. **无前景感知**：`isElementVisible()` 不检查元素是否被遮罩挡住，背景元素全部被当作"可见"，浪费名额
3. **交互选择器过严**：框架渲染的弹窗按钮（Vue/React 用 `<div>` + `@click`）没有 `role`、`onclick`、`tabindex`、
   `cursor:pointer`，Phase 1 和 Phase 2 都捞不到
4. **无弹窗上下文**：AI 不知道当前有弹窗打开，也不知道哪些按钮在弹窗里

## Requirements

### A. 弹窗检测 (Dialog Detection)

1. 检测页面上当前活跃的弹窗容器，三层策略：
    - **原生 / ARIA**：`<dialog[open]>`、`[role="dialog"]`、`[role="alertdialog"]`、`[aria-modal="true"]`
    - **启发式兜底**（仅在上一层无结果时）：`position: fixed/absolute` + `z-index >= 100` + 合理尺寸（非全屏遮罩、非小
      tooltip）+ 包含交互元素
2. 检测结果用于后续的元素分离和优先排序

### B. 弹窗元素优先提取 (Dialog-First Extraction)

1. 检测到弹窗时，将所有候选元素分为**弹窗内**和**页面背景**两组
2. **弹窗元素排在列表最前面**（编号从 [1] 开始），额外分配 50 个名额（`MAX_DIALOG_ELEMENTS = 50`）
3. 页面背景元素排在弹窗元素之后，保留原有 150 个名额
4. 有弹窗时总上限为 200（50 弹窗 + 150 页面），无弹窗时仍为 150

### C. 弹窗内宽松过滤 (Relaxed Dialog Filtering)

1. 弹窗内不依赖 `INTERACTIVE_SELECTORS`，而是扫描弹窗容器内所有子元素
2. 原生交互元素（button / a / input / textarea / select）无条件收录
3. 其他元素（div / span / li / label / p / h1-h6 等）只要满足以下任一条件即收录：
    - 有直接文本内容（`childNodes` 中的 `TEXT_NODE`）
    - 有 `aria-label` 或 `role` 属性
4. 父子去重：如果父元素的文本与某个子元素完全相同，只保留叶子节点
5. 仍然排除不可见元素和 ChromePilot 自身的 UI 元素

### D. 上下文标注 (Context Annotation)

1. 弹窗内元素的 section context 标注为 `dialog: {弹窗标题}`
2. 弹窗标题提取优先级：弹窗内的 heading (h1-h6) > `aria-label` > `aria-labelledby` 对应元素的文本
3. 元素列表头部增加提示行：`⚠ Active dialog detected — dialog elements listed first.`

### E. LLM 提示词适配 (System Prompt Update)

1. System Prompt 新增第 5 条规则：当元素列表头部出现 `⚠ Active dialog detected` 时，弹窗元素排在最前面，AI
   应优先操作弹窗元素，除非用户指令明确针对背景页面

## Affected Files

| File                           | Change                                                                                       |
|--------------------------------|----------------------------------------------------------------------------------------------|
| `src/content/dom-extractor.js` | 新增 `findActiveDialogs()`、`collectDialogElements()`；重构 `extractInteractiveElements()` 为弹窗优先逻辑 |
| `src/background/llm-client.js` | System Prompt 新增弹窗优先规则                                                                       |

## Acceptance Criteria

- [ ] 页面有 `<dialog open>` 时，弹窗内元素排在列表 [1] 开始的位置
- [ ] 页面有 `[role="dialog"]` / `[aria-modal="true"]` 时，同上
- [ ] 框架渲染的弹窗（无 ARIA 标记，仅 fixed + 高 z-index）能被启发式检测到
- [ ] Habitica Stats 弹窗的加点按钮能被识别到（Vue `<div>` + `@click`，无 role/tabindex）
- [ ] 弹窗内元素上限 50，页面背景元素上限 150，总上限 200
- [ ] 无弹窗时行为与之前完全一致，不影响现有功能
- [ ] 弹窗内元素标注 `(in: dialog: ...)` 上下文
- [ ] 元素列表头部有 `⚠ Active dialog detected` 提示
- [ ] AI 在有弹窗时优先操作弹窗内按钮
- [ ] Debug Overlay 在有弹窗时正确高亮弹窗内元素
