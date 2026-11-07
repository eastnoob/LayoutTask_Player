# 参与者元数据提前保存设计记录

日期：2026-11-07（Europe/Berlin）

状态：修复已通过回归与复审，源码已提交推送，VPS receiver 已先行更新，中英文自包含静态包已发布，英文 GitHub Pages 已构建并核验。部署与测试证据见 `docs/superpowers/verification/2026-11-07-reliable-data-pipe.md`。

## 用户确认的修改点

年龄、生理性别、是否需要日常视力矫正、Prolific ID 等参与者信息在填写完成后，立即保存到 VPS。保存方式应与当前实验数据使用同一个 `experiment_id`、`participant_id`、`session_id` 和 assignment/sequence 关联。

这项修改只涉及数据传输后端及其必要的最小调用，不改变任何实验 UI、教程、题目、计时、评分或正式数据文件格式。

## 修复前的事实

- 页面开始阶段已经收集参与者信息，并立即写入浏览器 session/local backup。
- 每个 trial Confirm 后，VPS 会保存 trial 答案和 assignment/sequence 信息。
- 当前 trial 上传不包含年龄、生理性别、视力矫正信息或 Prolific ID。
- 这些信息目前主要在最终 `/submit` 中随 `session.csv`、`debug.json` 和教程结果文件上传到 VPS。
- 因此，被试中途退出时，VPS 可能已有部分或全部 trial 数据，但尚未有完整的参与者人口信息和 Prolific ID。

## 推荐实现

参与者信息填写完成后，客户端发送一次独立的 session metadata submission。该记录使用当前实验 session 的稳定身份作为幂等键；相同内容重复发送确认同一条记录，内容冲突保留首个版本，不生成新的 participant、sequence 或 trial。

建议沿用现有 `/submit` 接收入口和本地 spool、SQLite、JSONL、archive target、重试及归档目录结构，只增加一个明确的 metadata submission 类型。metadata 记录至少包含：

- `experiment_id`
- `participant_id`
- `session_id`
- `prolific_id`
- assignment 与 sequence 字段
- participant profile（年龄、生理性别、视力矫正）
- consent 元数据（如果当前流程已有并允许保存）
- schema 版本与接收时间

metadata 应作为独立的、可验证的 JSON 文件保存并归档。每个 trial 继续保存原有 trial 文件；最终 `/submit` 继续保存现有的完整 CSV/JSON 汇总文件。这样不会把人口信息重复写入 24 个 trial 文件，也不会改变现有结果解析格式。

## 必须保持的性质

- metadata、trial 和 final 使用同一个 session/participant/assignment 关联。
- 重复请求不能产生重复记录或消耗新的 sequence slot。
- metadata 上传失败时保留浏览器本地备份，并允许后台或后续请求补传。
- metadata 与 trial/final 一样进入坚果云和 Sciebo 双目标归档。
- 只有目标云端确认成功后，才按现有规则清理 VPS 暂存。
- 历史记录不自动重写，不影响当前正在进行的实验。

## Grill-me 逐项自检与强化决定

### 1. 数据内容必须与当前完全一致

通过，强化为硬约束：现有 trial 文件、tutorial 文件、最终 CSV/JSON 文件的内容、文件名、哈希、身份字段、sequence 关联和目录结构均不修改。session metadata 是新增的补充记录，不替换、不重写、不拆分现有文件。

实现时不得把人口信息重复注入每个 trial 文件；最终汇总文件仍按当前代码生成并保存。

### 2. 数据传输必须成功

需要精确定义为两层保证：

- **VPS 接收保证**：接口返回成功前，submission 和 metadata 已通过校验并可靠写入 VPS 的 SQLite、spool 和可恢复的待归档状态。不能在仅进入内存、仅启动后台线程或仅获得云端请求句柄时返回成功。
- **云端最终保证**：坚果云和 Sciebo 的归档任务持久记录在 VPS 上，使用独立目标状态和重试；任一目标失败时保留本地 spool，恢复后继续传输，直到两个目标都成功。

“必然成功”不能解释为在 VPS 磁盘损坏、网络永久中断或两家云服务永久不可用时仍能立即成功；这种外部状态下只能保证不丢数据、不假报成功，并在恢复后继续传输。所有 2xx 响应都必须真实表示 VPS 已可靠接收，不能把 `queued` 伪装成 `archived`。

### 3. 被试端必须无感

通过 UI 和实验行为不变：不新增页面、提示、按钮、倒计时、等待步骤、错误弹窗或可见状态；不改变教程、题目、计时、评分、Pause、Confirm 或完成页。

唯一不可避免的客户端动作是人口信息填写完成并获得 assignment 后发出一次后台 metadata 请求；它属于 data pipe 传输，不阻塞页面、不改变页面内容。请求失败时写入现有本地备份并由后续后台重试/下一次数据请求补传，不向被试显示失败。

### 4. 不能引入重复记录或错误关联

通过，进一步强化：metadata 的幂等键固定为 `experiment_id + participant_id + session_id`，并保存内容哈希。相同内容的重复请求返回已接收；相同身份但内容不同的请求返回冲突并保留首个已确认版本，禁止覆盖人口信息、participant number、sequence 或 assignment。

metadata、每个 trial 和最终 submission 必须引用同一 session、participant 和 assignment。metadata 请求不得调用 assignment 分配逻辑，也不得消耗新的 sequence slot。

### 5. 双云保存必须互不影响

通过现有 `archive_targets` 机制，强化为独立状态机：坚果云成功而 Sciebo 失败时只重试 Sciebo；反之亦然。任何一个目标未成功都不得删除 VPS spool。两个目标均确认后才标记完整归档并清理本地文件。

Sciebo 的生产 remote 必须在部署前完成一次写入、读取、哈希和删除测试；仅 `lsf` 可读不算双保存已验证。

### 6. 速度和假失败必须改善

`/submit` 只承担校验、落盘和登记后台归档；`/archive` 只等待整场数据已经在 VPS 可靠登记并进入持久队列，然后快速返回 `202`/等价成功响应。它不能同步执行所有 rclone 云端传输。

后台 worker 使用持久数据库状态、单 session 锁、有限并发和退避重试；服务重启后自动扫描 `pending`、`failed`、`partial`。同时减少每批重复 `rclone mkdir` 调用，保留原有远端路径和文件内容。

### 7. 早退和网络异常必须有可恢复路径

必须测试人口信息填写后、第一道 trial 前关闭页面的情况：若 metadata 请求已收到，VPS 应能独立归档；若请求当时失败，浏览器本地备份应保留 metadata，后续存在可用数据传输机会时自动补传。不能声称在页面完全关闭且 VPS 从未收到任何字节时，服务器能够凭空恢复数据。

### 8. 现有前端协议兼容性

当前前端把任意 2xx `/archive` 响应视为成功并清理本地备份。因此后端可以返回“VPS 已持久接收、云端归档排队”的 2xx 响应而不改 UI；但响应体必须明确记录 `archive_status: queued` 或 `pending`，绝不能标为 `archived`。现有 final `/submit`、trial `/submit` 和 recovery ZIP 行为继续兼容。

### 9. 历史数据和生产设施安全

只对新会话启用 metadata；不为历史 submission 强行补造人口信息，也不因为新增 Sciebo 目标而要求已删除 spool 的历史记录重新上传。历史归档、assignment 计数器、sequence 表和当前实验数据保持不变。

### 10. 最小实现范围

不新增 Redis、Celery、消息队列或新的外部数据库。优先扩展现有 receiver 的 schema、SQLite 状态、spool、JSONL、`archive_targets`、`retry_pending()` 和 rclone backend；仅增加必要的后台 worker 与不可见 metadata 发送调用。

## 验收要求

实施前后均需验证：

1. 填写人口信息后立即能在 VPS 的 SQLite、JSONL 或 spool 中找到对应 metadata。
2. 在第一个 trial 前关闭页面，metadata 仍可归档和恢复。
3. 重复刷新或重复发送不会产生第二条 metadata，也不会改变 participant number 或 sequence。
4. 完整实验仍生成原有的 24 个正式 trial、tutorial 和 final 文件。
5. metadata、trial、final 的文件内容、哈希、目录和身份关联正确。
6. 坚果云成功而 Sciebo 失败时只补传 Sciebo；两边都成功后才删除本地 spool。
7. VPS 发生重启后，metadata、trial 和 final 均能从持久状态继续归档。
8. `/archive` 的快速响应不会使前端误报云端已完成；最终状态仍可从 receiver 状态和归档目录核对。
9. 完整正式 workload 下，被试等待时间不再受云端 rclone 传输时长控制。
10. Sciebo 和坚果云各自完成实际写入、读取、哈希核对和失败恢复测试。

## 范围边界

本次允许重新生成并发布中英文静态网页包以交付 data pipe 修复；不修改 UI、刺激素材、sequence、评分算法或历史数据。客户端改动仅限不可见的 metadata 发送与持久补传，不改变任何用户可见或实验行为。receiver 必须先部署并验证兼容性，再发布调用新 metadata 类型的网页包。

## 未通过自检的原始表述及修正

原始表述“数据传输必然要成功”过于绝对，无法覆盖 VPS 磁盘损坏或外部网络永久中断。已修正为“VPS 成功响应即可靠落盘；云端任务持久排队并最终重试；任何失败不丢数据、不假报成功”。这保持用户要求的实际目标，同时避免实现一个无法验证的承诺。
