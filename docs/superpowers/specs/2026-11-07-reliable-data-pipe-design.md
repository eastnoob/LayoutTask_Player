# Reliable data pipe and early session metadata design

日期：2026-11-07（Europe/Berlin）

## Goal

在不改变参与者可见 UI、实验流程、题目、计时、评分或现有结果文件的前提下，让参与者信息在填写完成后进入 VPS，并让 trial/final 数据先可靠落盘、再由后台完成坚果云与 Sciebo 双目标归档。

## Non-negotiable behavior

- 现有 trial、tutorial、final 文件的字节内容、文件名、哈希、身份字段、sequence 关联和目录结构保持不变。
- 已收到 VPS 成功响应的数据必须已经写入持久 SQLite 和 spool；不能只放在内存或一次性后台线程中。
- 云端归档失败不能丢数据或假报 `archived`；未完成双目标归档时保留 spool。
- `/archive` 可以快速返回 `queued`，但只能表示 VPS 已可靠登记后台任务；现有前端接受任意 2xx，因此不需要改变可见行为。
- session metadata 使用 `experiment_id + participant_id + session_id` 幂等；重复同内容请求返回同一记录，内容冲突拒绝覆盖。
- 历史记录不回填、不重写；不改变 assignment、participant number 或 sequence 计数。

## Data flow

1. 参与者完成 consent/profile/Prolific ID 和服务器 assignment 后，客户端发送一次不可见的 metadata submission。该请求不阻塞 UI；失败时继续保留本地 IndexedDB 备份，并在后续 data pipe 调用中重试。
2. receiver 将 metadata 作为独立 v2 submission 保存为 JSON 文件并写入 SQLite/spool。它不进入每个 trial 文件，也不替代最终汇总文件。
3. 每个 trial 仍按现有流程写入本地备份并提交原有 trial payload。
4. final 仍按现有流程提交完整 CSV/JSON 文件。最终汇总文件继续包含当前人口信息和 Prolific ID 字段。
5. `/archive` 只验证当前 session 有已接收 submission，并返回持久排队状态。单个 receiver worker 扫描现有 pending/failed/partial 状态，独立向坚果云和 Sciebo 传输。
6. 两个归档目标分别记录成功/失败；只有全部目标成功后才删除 spool。

## Minimal implementation boundary

优先复用现有 `ReceiverStorage`、v2 validation、`archive_targets`、session lock、JSONL reconciliation、`retry_pending()` 和 rclone backend。增加的内容限于：metadata submission 类型及幂等索引、快速 enqueue archive API、receiver 内部持久状态 worker、不可见 metadata data-pipe 调用、双云生产配置和必要测试/说明。

不新增 Redis、Celery、消息队列、外部数据库或 UI 控件；不修改静态实验行为。

## Failure semantics

- VPS 磁盘、进程或网络故障期间不能承诺物理上的立即成功；客户端只能保留本地备份并重试。
- VPS 返回 2xx 只表示可靠接收或可靠排队，不表示云端已完成。
- 云端临时失败由持久状态和退避重试处理；服务重启后继续。
- metadata 内容冲突返回 409，保留首个已接受版本，禁止静默覆盖。

## Acceptance

- metadata 在第一个 trial 前可在 VPS 找到。
- 每个 trial 仍有原有 submission；完整实验仍产生原有 final 文件集合。
- participant、session、assignment、sequence 关联一致，重复 metadata 不产生新 assignment/slot。
- `/archive` 响应不受云端传输时间影响；正式 26 批 workload 不等待 rclone 完成。
- worker 重启恢复、单云失败恢复、双云写入/读取/哈希核对均通过。
- 中英文从同一份已验证源码生成独立、自包含静态包；包内容只包含本次 data-pipe 兼容改动。
