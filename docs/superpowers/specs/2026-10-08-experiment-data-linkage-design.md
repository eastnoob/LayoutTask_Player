# 实验数据关联与归档设计

**状态：** 用户已确认按此方向实施。

## 目的与口径

让每道题的备份、整场实验的最终文件及服务端分配记录能够凭明确的 ID 相互关联；同一名参与者的不同场次不得混在一起。`participant_number` 是服务端分配的编号，`sequence_id` 是实际使用的 Williams 顺序，两者不能互相推算。

统计以整场实验为单位，分别记录作答进度和归档状态：

| 作答证据 | 作答进度 | 数据状态 |
| --- | --- | --- |
| 只有教程或少于 25 个有效正式呈现位置 | 未完成 | 按实际存储状态记录 |
| 有证据证明同一场包含 25 个不同且符合该顺序表的正式呈现位置，缺少最终文件 | 作答完成 | 最终结果待核实 |
| 最终 `raw_results.csv` 有 25 个不同且符合该顺序表的正式呈现位置 | 完整实验数据 | 另记 pending、partial 或 archived |

单题备份用于恢复和核验，不作为额外参与者或额外完成场次。教程归档、文件数、提交数和 `archive_status=archived` 均不单独证明实验完成。若最终文件与单题备份冲突，保留两份原件并报告差异，不自动选一份覆盖另一份。

## 已观察的实现事实

- `/assign` 在 SQLite 中保存 `assignment_id`、`participant_number`、`sequence_id` 与 `schedule_version`；正式时间线按返回的 `sequence_id` 选择呈现顺序。
- 最终 CSV 已包含分配字段，`raw_results.csv` 的 `result_json.session` 是题目自己的 session ID。
- `src/core/data-save-service.ts` 生成的单题备份和 receiver 提交没有分配字段；`src/experiment-runner.ts` 建立单题保存配置时没有把分配记录及整场 session ID 传入。
- 单题提交的 `session_id` 取题目自己的 `result.session`，最终提交与 `/archive` 使用整场实验的 session ID。接收端只归档与 `/archive` 三元组一致的提交。
- 后台 `retry_pending()` 可先单独归档提交并清除其 spool；现有 `archive_session()` 随后仍试图复制该 session 下所有提交的 spool。

先前的 `2026-09-30-sequence-replacement-assignment-design.md` 已要求单题保存完整分配信息；本设计补齐该承诺及归档关联。

## 方案选择

只补客户端字段，文件本身可读，但接收端仍按不同 session 分组，也不能验证编号。只在接收端做隐式映射，单题文件离开数据库后仍难独立解释。采用端到端方案：客户端在单题备份中写入身份，receiver 校验并索引身份，所有同场提交使用同一个整场 session ID。

## 新数据契约

正式实验的单题备份使用 `layouttask.backup.v2`；单题与最终批次的 receiver 提交都使用 `layouttask.receiver.submission.v2`，并分别标明 `submission_kind: trial` 或 `submission_kind: final`。单题提交必须有 `trial_session_id`，最终批次不得伪装为单题。原有 v1 文件及请求仍可读取和接受，但不得被默认为 v2 已验证数据。独立单题演示和开发者调试可继续走现有无分配记录的路径。

每份正式单题备份与对应提交具有：

| 字段 | 来源与意义 |
| --- | --- |
| `experiment_id`、`participant_id` | 当前实验及参与者身份 |
| `session_id` | 整场实验 session ID；receiver 用它归档分组 |
| `trial_session_id` | 当前题的 `result.session`；用于与最终 `raw_results.csv` 对照 |
| `assignment_id`、`participant_number`、`sequence_id`、`schedule_version` | 同一份 `/assign` 响应；正式场次必填 |
| `assignment_mode`、`requested_sequence_id`、`replacement_attempt`、`rotation_index` | 原分配记录的审计字段，空值语义沿用现有格式 |
| `trial_type`、`trial_index`、`task_id`、`qid`、`presentation_id` | 当前题的位置与内容；教程题的呈现位置为空 |
| `hash8`、`encoding`、`encoded` | 沿用现有结果载荷；解码后仍保留原始 `result.session` |

前端只投影一次 `/assign` 响应，然后将它和整场 session ID 传入每道题的保存配置。备份文件、浏览器 IndexedDB 副本与 receiver 请求使用同一套字段。单题文件名继续包含题目 session ID，避免同一场中的重复题名冲突。正式开始时已有的顺序 ID 精确选择逻辑保持不变；保存时核对该题 `presentation_id` 与所选顺序的对应位置。

最终 `session.csv`、`raw_results.csv`、结果和事件 CSV 继续使用现有分配字段及整场 session ID。`raw_results.csv` 通过已有的 `result_json.session`、`hash8`、`trial_index` 与 `presentation_id` 对应单题备份，无须改动既有 CSV 列顺序。分析程序应从这些字段建立连接，不按文件名或参与者编号推断顺序。

## Receiver 校验、存储与归档

receiver 对 v2 正式提交查询 `assignment_id`，核对实验、编号、顺序、版本及所有分配审计字段。单题提交的顶层身份必须与其备份 JSON 一致；最终批次的顶层身份必须与 `session.csv` 及逐题 `raw_results.csv` 的身份列一致。不一致时拒绝归档，避免索引所指的人和文件内容不是同一人。第一次有效 v2 提交将 `participant_id` 绑定到该分配记录；此后不同 `participant_id` 使用同一分配 ID 报冲突。允许同一分配 ID 下出现不同整场 session，但分别归档和统计，避免浏览器重开或重做时覆盖旧场次。旧 v1 提交不触发身份绑定。

v2 元数据写入 SQLite 提交索引、JSONL 与归档 manifest；原始备份文件保持原样。对同一整场中的同一 `trial_session_id`，编码结果相同的重传返回原提交，结果不同的重传报冲突；比较使用完整编码结果的摘要，不把可变的 `saved_at` 时间戳或八位短哈希当作内容身份。最终批次的相同重传也不得生成第二份正式结果。

所有 v2 单题及最终批次使用 `(experiment_id, participant_id, session_id)` 归档到同一整场路径，文件仍按提交 ID 独立存放。单题收到后的 `pending` 表示等待归档，不表示作答未完成。后台可把中途退出的单题先归档，数据状态与作答进度独立。

`archive_session()` 必须按目标跳过已成功归档的提交，只为尚未归档的提交读取 spool。这样后台先归档单题、清除 spool 后，最终 `/archive` 仍可完成；同一目标的重试不得覆盖内容不同的文件。只有最终批次被接受且其归档目标成功，前端才报告最终保存成功；最终批次缺失时仍可保留单题数据供恢复。

## 历史数据审计

历史处理不修改原备份、原 SQLite 行或远程归档。先保存只读清单和摘要，再对 v1 单题备份解码，以 `participant_id`、题目 `session`、`hash8`、任务和呈现位置与最终 `raw_results.csv` 的逐题结果做唯一匹配。匹配到带分配字段的最终结果后，输出带来源、规则及置信依据的关联清单；多个候选或无最终结果的记录明确标为未确定。不能以 `sequence_id`、时间接近或文件名独自反推 `participant_number`。

审计对能证实整场 session 的记录统计有效正式呈现位置数，并单列“教程归档”“部分正式题”“25 题但缺最终文件”“完整最终文件”，避免把单题备份计为多名参与者。旧单题若未能匹配到最终文件或其他可靠的整场 session 证据，列为“场次未确定”；即使同一 `participant_id` 下恰有 25 道题，也不得据此宣称一场作答完成。经过人工复核的旧记录若需补充归档，写入独立的恢复索引；原文件不覆盖。未确定记录保留原状。

## 兼容与实施边界

先部署兼容 v1/v2 的 receiver，再发布 v2 前端。数据库新增索引字段为可空，旧行的含义不变。部署前在隔离数据目录测试自动和替补分配、25 题完成、教程-only、中断、重复上传、身份冲突、后台先归档以及多目标部分失败；发布后用一场受控测试核对 receiver 清单、归档路径与最终 CSV 的字段一致性。不要用生产分配号进行无标记测试。

涉及 `src/experiment-runner.ts`、`src/types/runtime.ts`、`src/core/data-save-service.ts`、`receiver/app/models.py`、`receiver/app/storage.py`、对应测试与接收端文档。只在确有调用需求时调整插件传参；不改 Williams 顺序生成、题目内容或已发布的旧 CSV 列顺序。

## 验收标准

1. 自动分配与替补分配均能从单题备份独立读出真实 `participant_number` 和 `sequence_id`；编号与顺序不同时仍正确。
2. 同一场的单题与最终批次在 receiver 中使用同一个整场 session ID；题目 session ID 仍可与 `raw_results.csv` 对照。
3. 已被后台归档并清除 spool 的单题不妨碍随后整场归档。
4. 重传不会重复计数，身份或题目内容冲突可见且原件不被覆盖。
5. 完成场次按 25 个不同、符合 schedule 的正式呈现位置及最终文件判断；教程-only 与部分场次不会误计为完成。
6. 旧记录的关联清单逐条给出证据，无法唯一匹配时保留“未确定”。
