# 刺激变量与恢复正确性分析

> 注意：本文件中的早期 bootstrap 是描述性的精度稳定性检查，不是确认性 power analysis。正式样本量判断请使用同目录外的 `../2026-09-29-preregistered-models/preregistered-model-report.md`。

## 数据完整性

- 独立 participant cluster：5。
- 任务对位：23/23 个正式场景。
- 逐家具观测：600 行（只含 formal，不含 tutorial）。
- 正式 presentation：150；重复场景 presentation：23 个场景。
- 位置和旋转误差分开计算；旋转使用 8 步圆周距离。

## 逐模型描述性结果

| 模型 | 观测数 | 平均位置误差（步） | 平均旋转误差（步） | 位置完全正确 | 旋转完全正确 |
|---|---:|---:|---:|---:|---:|
| M03 | 150 | 0.87 | 1.69 | 45.3% | 28.7% |
| M04 | 150 | 1.36 | 1.31 | 28.7% | 50.7% |
| M05 | 150 | 1.56 | 1.41 | 20.0% | 26.0% |
| M01 | 150 | 1.19 | 1.22 | 28.7% | 34.7% |

## 变量审计

| 变量 | 非空数 | 唯一值数 | 分类 |
|---|---:|---:|---|
| asymmetricCueVisibilityAngleWeighted | 600 | 56 | core |
| targetFurnitureSilhouetteVisibility | 600 | 38 | core |
| furnitureGroupSilhouetteVisibility | 600 | 51 | core |
| featureCueVisibility | 600 | 79 | core |
| relationVisibilityTotal | 600 | 89 | core |
| relationPerspectiveTotal | 600 | 91 | exploratory |
| volumeAxisRetention | 600 | 91 | core |
| volumeAngularSeparation | 600 | 91 | core |
| asymmetricCueVisibility | 600 | 22 | exploratory |
| PerspectiveRank | 600 | 91 | core |

## 变量关联筛查

下面是逐家具观测的 Pearson 相关系数，仅用于筛查，不是控制 participant/scene 聚类后的正式效应估计，也不代表因果关系。

| 变量 | n | 位置误差 r | 旋转误差 r | 位置完全正确 r | 旋转完全正确 r |
|---|---:|---:|---:|---:|---:|
| targetFurnitureSilhouetteVisibility | 600 | -0.043 | 0.226 | 0.048 | -0.005 |
| furnitureGroupSilhouetteVisibility | 600 | -0.145 | 0.039 | 0.138 | 0.159 |
| asymmetricCueVisibilityAngleWeighted | 600 | -0.170 | 0.318 | 0.140 | -0.125 |
| featureCueVisibility | 600 | -0.044 | 0.230 | 0.033 | -0.073 |
| relationVisibilityTotal | 600 | 0.064 | 0.026 | -0.029 | 0.182 |
| PerspectiveRank | 600 | -0.108 | 0.258 | 0.083 | -0.060 |
| volumeAxisRetention | 600 | -0.042 | 0.062 | -0.017 | -0.048 |
| volumeAngularSeparation | 600 | -0.114 | -0.083 | 0.036 | 0.114 |
| asymmetricCueVisibility | 600 | -0.155 | 0.189 | 0.152 | 0.006 |
| relationPerspectiveTotal | 600 | -0.108 | 0.237 | 0.087 | -0.068 |

## 被试数量模拟

这是**精度稳定性模拟**，不是自动排除规则：以被试为聚类单位进行 bootstrap，保留每个被试的 23 场景 × 4 家具模型结构。表中 power 表示 95% 置信区间半宽达到预设阈值的比例：位置/旋转误差阈值均为 0.25 步，完全正确率阈值均为 0.08。

| 被试数 | 位置误差稳定 | 旋转误差稳定 | 位置完全正确率稳定 | 旋转完全正确率稳定 |
|---:|---:|---:|---:|---:|
| 4 | 100.0% | 100.0% | 100.0% | 100.0% |
| 6 | 100.0% | 100.0% | 100.0% | 100.0% |
| 8 | 100.0% | 100.0% | 100.0% | 100.0% |
| 12 | 100.0% | 100.0% | 100.0% | 100.0% |
| 16 | 100.0% | 100.0% | 100.0% | 100.0% |
| 20 | 100.0% | 100.0% | 100.0% | 100.0% |
| 24 | 100.0% | 100.0% | 100.0% | 100.0% |
| 30 | 100.0% | 100.0% | 100.0% | 100.0% |
| 40 | 100.0% | 100.0% | 100.0% | 100.0% |

当前 bootstrap 显示最小候选 4 已达到这些精度阈值，但 pilot 只有 5 个独立 participant cluster，因此不能把这个数当作最终招募承诺；应继续收集 pilot 或预注册正式模型后复核。
