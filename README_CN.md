<div align="center">

<img src="src/icons/icon-128.png" alt="ChromePilot" width="128">

# ChromePilot

**用自然语言控制任何网页。**

一个 Chrome 扩展，让你用一句话自动化浏览器操作——点击、输入、滚动、导航，说什么做什么。

[![Chrome](https://img.shields.io/badge/Chrome-扩展-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.md) · [中文](#功能特点)

</div>

---

## 功能特点

- **自然语言控制** — 输入 "点击登录按钮"、"在搜索框输入 hello" 即可自动执行
- **多步连续操作** — 支持复杂任务链："打开 Habitica 然后完成所有每日任务"
- **智能导航** — 说 "打开百度"、"去 YouTube" 即可跳转
- **结果提取** — 问 "用谷歌翻译翻译'惊喜'"，直接在聊天框返回翻译结果
- **全局侧边栏** — 切换标签页后面板依然保留，聊天记录不丢失
- **多 LLM 支持** — 支持 OpenAI、Claude、GitHub Copilot、Ollama（本地）等
- **可配置** — 操作间隔、最大步数、新标签页/当前页跳转 均可在面板顶部快速调整

## 演示

### 基础操作 — 点击、输入、滚动

> 命令：*"drink water 10 times"*

![基础操作演示](docs/images/1.%20drink%20water%2010%20times.gif)

### 页内导航 — 多步连续任务

> 命令：*"go to tasks and drink water 10 times"*

![页内导航演示](docs/images/2.%20go%20to%20tasks%20and%20drink%20water%2010%20times.gif)

### 跨页导航 — 打开网址 & 提取结果

> 命令：*"go to Google Translate and translate 'what is surprise' to Chinese"*

![跨页导航演示](docs/images/3.%20go%20to%20google%20translator%20and%20translat%20what%20is%20superpise%20to%20chinese.gif)

## 安装步骤

1. 克隆仓库：
   ```bash
   git clone https://github.com/GOODDAYDAY/ChromePilot.git
   ```

2. 打开 `chrome://extensions`，开启 **开发者模式**（右上角开关）

3. 点击 **加载已解压的扩展程序**，选择 `src` 文件夹

4. 点击工具栏的 ChromePilot 图标打开侧边栏

## 配置

1. 右键 ChromePilot 图标 → **选项**（或进入 `chrome://extensions` → ChromePilot → 详情 → 扩展程序选项）

2. 选择 **Provider 预设**：

   | Provider | 地址 | 说明 |
      |----------|------|------|
   | OpenAI | `https://api.openai.com` | 需要 API Key |
   | Anthropic Claude | `https://api.anthropic.com` | 需要 API Key |
   | GitHub Copilot | `https://models.inference.ai.azure.com` | 需要 GitHub Token |
   | Ollama（本地） | `http://localhost:11434` | 免费，本地运行 |
   | 自定义 | 任何 OpenAI 兼容接口 | |

3. 填入 **API Key** 和 **模型名称**

4. 点击 **Test Connection** 测试连接，然后点 **Save** 保存

### 面板设置

侧边栏顶部提供快捷设置：

| 设置    | 选项                    | 默认值  | 说明                |
|-------|-----------------------|------|-------------------|
| 当前页跳转 | 开/关                   | 关    | 导航时在当前标签页打开而非新标签页 |
| 最大步数  | 5 / 10 / 20 / 50 / 无限 | 10   | 每条命令最多执行的 LLM 轮次  |
| 操作间隔  | 0s – 5s               | 0.5s | 每个操作之间的等待时间       |

## 支持的操作

| 操作           | 说明        | 示例命令                   |
|--------------|-----------|------------------------|
| **click**    | 点击任何交互元素  | "点击提交按钮"               |
| **type**     | 在输入框中输入文字 | "在搜索框输入 hello world"   |
| **scroll**   | 滚动页面      | "往下滚动"                 |
| **navigate** | 打开网址      | "打开百度"、"去 youtube.com" |
| **read**     | 提取页面文本    | "错误信息是什么？"             |

## 架构

```
src/
├── manifest.json              # Chrome MV3 清单文件
├── background/
│   ├── service-worker.js      # 调度器：DOM → LLM → Actions 循环
│   └── llm-client.js          # 多 Provider LLM 客户端
├── content/
│   ├── content-script.js      # 网页消息处理
│   ├── dom-extractor.js       # 提取交互元素
│   └── action-executor.js     # 模拟 click/type/scroll/read
├── sidepanel/
│   ├── sidepanel.html         # 聊天界面（Chrome Side Panel API）
│   ├── sidepanel.js           # 面板逻辑 & 设置
│   └── sidepanel.css          # 样式
├── options/                   # LLM 配置页面
├── lib/utils.js               # 公共工具函数
└── icons/                     # 扩展图标
```

### 工作原理

1. 用户在侧边栏输入命令
2. Service Worker 提取当前标签页的交互元素
3. 元素列表 + 命令发送给配置的 LLM
4. LLM 返回操作列表（click、type、scroll、navigate、read）
5. 按顺序在页面上逐个执行操作
6. 如果任务未完成（`done: false`），从第 2 步重新开始

## 系统要求

- Chrome 114+（需要 Side Panel API）
- 一个 LLM API 端点（云端或本地均可）

## 许可证

MIT
