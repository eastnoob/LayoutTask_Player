# VPS 先完成判定、云端后台归档设计笔记

日期：2026-11-08（Europe/Berlin）

## 修改原因

此前最终 `/archive` 请求会等待坚果云和 Sciebo 的传输。云端传输超过前端约 30 秒超时后，参与者会看到保存失败，但 VPS 可能已经完整收到数据，形成假失败。

## 目标流程

1. 每次 trial 点击 Confirm 后，客户端继续立即把 trial 保存到本地 IndexedDB，并提交到 VPS。
2. VPS 先将 trial 持久写入 SQLite、JSONL 和 spool；成功写入后才向客户端确认收到。
3. 最终提交时，VPS 接收 final CSV，并只在本地检查和汇总：
   - participant、session、assignment、sequence 身份一致；
   - 所有预期正式 trial 均已收到；
   - trial index 和 presentation ID 无缺失、无重复；
   - trial 内容 hash 和嵌入身份一致；
   - metadata 和 final CSV 已保存且身份一致。
4. 检查通过后，VPS 生成 session manifest，并返回 `data_complete=true`、`archive_status=pending`。
5. 客户端只有收到 data_complete=true 后才报告成功结束；现有完成码页面的字段和界面保持不变。
6. VPS 后台随后向坚果云和 Sciebo 传输已完成 session。云端失败只进入重试，不影响参与者通过。

## 通过与失败标准

### 通过

VPS 已持久接收完整 trial、metadata 和 final 文件，身份及 sequence 校验通过，并成功生成 session manifest。云端归档可以仍为 `pending`。

### 未完成

参与者没有完成必做教程或正式 trial，或者 VPS 检查到缺失、重复、身份冲突或 final 文件不完整。

### 需要恢复

VPS 无法确认最终数据已经持久保存，或最终请求发生暂时性网络错误。此时保留本地 IndexedDB 和 recovery ZIP，不把云端慢或云端失败直接判为参与者失败。

## 超时要求

- 最终 receiver batch 和 archive 请求的客户端超时标准从 30 秒改为 90 秒（1 分 30 秒）。
- 该设置用于提高最终提交的容错，但最终请求仍不得等待坚果云或 Sciebo；云端传输必须由后台 worker 完成。
- `ARCHIVE_RETRY_INTERVAL_SECONDS=30` 是后台扫描间隔，不是请求超时，本次不应误改。
- trial 单题保存的现有超时另行保持，除非后续单独确认需要调整。

## 必要实现边界

- worker 只处理已标记为 finalization requested 或 data complete 的 session，不再把所有进行中的 pending trial 立即上传到云端。
- session finalization 状态必须持久化，不能只依赖内存或浏览器最后一次请求。
- final submission 和 finalization 必须幂等；网络超时重试不能生成重复记录。
- 成功结束结果必须等待 VPS 返回 data_complete=true；完成码页面本身不因本次 transport 修复改版或改文案。
- 保持现有 trial、tutorial、final 文件格式和原有目录键；新增的 session manifest 用于完整性判定和归档状态追踪。

## 验收测试

- 云端人工延迟 60 秒或 90 秒时，VPS 仍能快速返回本地 `data_complete=true`，参与者不等待云端。
- 坚果云或 Sciebo 单独失败时，参与者仍可通过，worker 只重试失败目标。
- VPS 重启后，已接收 trial、final 和 finalization 状态仍可恢复。
- 最终请求重复发送只返回同一 session 结果，不产生重复文件或重复 assignment。
- 缺少一个 trial、存在重复 trial 或身份不一致时，VPS 返回不完整或需要恢复，不返回通过。
- 浏览器在最终请求超时后重试时，若 VPS 已接受数据，应返回已存在的完整结果。

本笔记记录已实施的 receiver 与客户端传输边界；本轮未迁移 VPS、清理历史数据或部署静态包。

## 2026-11-08 最新边界澄清

- 本次目标是修复数据传输与最终归档判定，不改实验题目、教程、刺激、评分、计时、暂停、放大镜或任何可见页面文案和布局。
- 客户端允许有最小的不可见 transport 改动：最终 receiver batch 与 `/archive` 请求使用 90 秒超时，并读取 VPS 的 `data_complete` 字段；正式 trial 的即时保存和现有 15 秒单次请求超时保持不变，后台 30 秒扫描间隔也保持不变。
- 现有 completion-code 页面继续使用原有字段和界面；只有在最终保存流程确认 `data_complete=true` 后，才允许显示成功结束结果。若不改变完成码字段而无法把完成码页面整体后移，则不得为了“门控”擅自新增第二种 final 文件格式。
- 绝对的网络必然成功无法由客户端保证。可保证的边界是：VPS 在确认本地 SQLite、JSONL、spool 和最终文件完整持久化后才报告 `data_complete=true`；坚果云或 Sciebo 的慢、超时、单目标失败只影响后台归档状态，不影响这次本地完整性判定。
- 新增的 finalization 状态和内部 manifest 只存放在 receiver 的 SQLite/内部控制数据中，不改变现有 trial、tutorial、final 文件字节、文件名、归档目录键或云端既有归档布局。
- receiver 必须使用与 `schedule_version` 对应的服务端期望正式 trial 数和教程要求配置，不能从收到的 final CSV 行数反推“应该收到多少题”。缺少该配置时只能报告配置错误/需要恢复，不能报告 `data_complete=true`。
- 本轮只写设计文档和实施计划；未修改代码、未迁移 VPS、未清理任何历史数据、未重新构建或部署静态包。
