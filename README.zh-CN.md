# ego-verified-actions

[English](README.md) · [中文](README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-1F6FEB?style=flat-square)](LICENSE)
[![ego lite](https://img.shields.io/badge/ego_lite-0.4.7.4-111111?style=flat-square)](https://lite.ego.app/)
[![OpenRouter](https://img.shields.io/badge/Jev-OpenRouter-6B4EFF?style=flat-square)](https://openrouter.ai/keys)

[ego lite](https://lite.ego.app/) 的配套 skill。编码 agent 给出 **目标** 和 **成功条件**，runner 在同一个 `ego-browser` 进程里列控件、点击，并返回 JSON。成功与否看最终 URL / 标题是否包含你给的子串，而不是模型说「做完了」。

点击之间不会把 `snapshotText()` 塞进大模型。

---

### 安装（Claude Code 与 Codex）

```bash
curl -fsSL https://raw.githubusercontent.com/raydocs/ego-verified-actions/main/scripts/install.sh | bash
```

脚本会把 skill 链到 `~/.claude/skills` 和 `~/.codex/skills`，然后询问 [OpenRouter](https://openrouter.ai/keys) 的 key（`sk-or-…`）。key 保存在 `~/.config/ego-verified-actions/env`（权限 600）。之后 `scripts/run` 自动读取，不必每轮 `export`。

```bash
npx skills add raydocs/ego-verified-actions
```

需要 `ego-browser` 在 `PATH` 上。

### 丢给 agent 的话

```
Read the ego-verified-actions skill. Do not dump snapshotText() into chat.
Run:
GOAL='Open the Docs page' URL='https://lite.ego.app/' SUCCESS_MATCH='/document' \
  ~/.claude/skills/ego-verified-actions/scripts/run
```

Codex 把路径换成 `~/.codex/skills/ego-verified-actions/scripts/run`。  
仅当 `ok: true` 且 `page.url` 含 `/document` 才算通过。打印 `elapsed_ms` 和 `steps[].via`。

---

## 和 Chrome / Playwright / 纯 ego-lite 的差别

| | Chrome computer-use | Playwright（agent 现写 locator） | ego-lite snapshot → 大模型 | **ego-lite + Jev** |
|---|---|---|---|---|
| 不占用你日常 Chrome | 否 | 是 | 是 | **是** |
| 能用已登录态 | 是* | 要额外配 | 是 | **是** |
| 整页 snapshot 进编码模型 | 是 | 通常会 | 是 | **否** |
| Docs 任务（本机实测） | — | — | 35–41 s | **4.1 s / 0.92 s** |

\* 挂到正在用的 Chrome 配置。

![Chrome、Playwright、ego-lite、ego-lite + Jev 对比](docs/compare.png)

Chrome / Playwright 的条是 **典型 agent 循环**（看截图，或每步让模型写 locator），不是写死的测试脚本。ego-lite 的数字是在本机对 [lite.ego.app](https://lite.ego.app/)「打开 Docs」**实测**的。

若排第一的控件 `href` 已包含 `SUCCESS_MATCH`，则跳过 Jev（`via: "href"`）。

---

## 工作方式

```
GOAL + SUCCESS_MATCH
        │
        ▼
  本地 snapshot  →  不透明 id 的控件表（click_1, …）
        │
        ├─ href 已命中 SUCCESS_MATCH  →  直接点
        └─ 否则  →  Jev Choice  →  校验分布  →  点
        │
        ▼
  仅当最终 URL/标题含 SUCCESS_MATCH 时 ok: true
```

Jev 看不到 `@ref`。输入内容只来自 `JEV_FILL`。默认最多 4 步。

---

## 用法

```bash
GOAL='Open the Docs page' \
  URL='https://lite.ego.app/' \
  SUCCESS_MATCH='/document' \
  ./scripts/run
```

| 变量 | 必填 | |
|---|---|---|
| `GOAL` | 是 | 成功长什么样 |
| `SUCCESS_MATCH` | 是 | URL 或标题子串 |
| `URL` | | 起始页面 |
| `JEV_FILL` | | 要填的 JSON 键值 |
| `MAX_STEPS` | | 默认 4，最大 8 |
| `SPACE` | | ego task space 名 |

```json
{
  "ok": true,
  "reason": "done",
  "elapsed_ms": 4131,
  "page": {
    "url": "https://lite.ego.app/document/en/docs/quick-start"
  },
  "steps": [
    { "via": "href", "acted": "click", "detail": "CLICK anchor \"Docs\" → …/quick-start" }
  ]
}
```

| `reason` | |
|---|---|
| `done` | 结束。需要内容再用 `js()` 抽。 |
| `need_llm` | 针对性地 snapshot 一次，然后 heredoc 或停下。 |
| `dialog` | 交给用户。 |
| `budget_exhausted` | 不要原样重跑。 |

只有 `done` 时 `ok` 为 true。

---

## 测试

```bash
node --test tests
```

## 许可

[MIT](LICENSE)。浏览器：[ego lite](https://lite.ego.app/)。决策：[TypeSafe Jev](https://docs.typesafe.ai)，经 OpenRouter。
