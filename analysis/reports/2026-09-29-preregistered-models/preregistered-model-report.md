# 预注册刺激变量模型与 power analysis

## Confirmatory specification

位置模型：`position_error ~ z_relationVisibilityTotal + z_relationPerspectiveTotal + model_id + (1|participant_id) + (1|task_id)`。

旋转模型：`rotation_error_steps ~ z_featureCueVisibility + z_asymmetricCueVisibilityAngleWeighted + model_id + (1|participant_id) + (1|task_id)`。

变量方向在分析前固定：relation 变量用于位置；feature 与 asymmetric cue 变量用于旋转。没有按 pilot p 值挑变量。标准化参数只来自刺激设计矩阵。

## Pilot fit

| term | estimate | std. error | p-value | singular |
|---|---:|---:|---:|---|
| (Intercept) | 1.2136 | 0.1352 | 0.0000 | 0.0000 |
| z_relationVisibilityTotal | 0.1138 | 0.0622 | 0.0681 | 0.0000 |
| z_relationPerspectiveTotal | -0.0671 | 0.0507 | 0.1858 | 0.0000 |
| model_idM03 | -0.2796 | 0.1268 | 0.0279 | 0.0000 |
| model_idM04 | 0.0326 | 0.1458 | 0.8234 | 0.0000 |
| model_idM05 | 0.3704 | 0.1187 | 0.0019 | 0.0000 |

| term | estimate | std. error | p-value | singular |
|---|---:|---:|---:|---|
| (Intercept) | 1.0268 | 0.1577 | 0.0000 | 0.0000 |
| z_featureCueVisibility | 0.0717 | 0.0685 | 0.2956 | 0.0000 |
| z_asymmetricCueVisibilityAngleWeighted | 0.6494 | 0.0764 | 0.0000 | 0.0000 |
| model_idM03 | 0.3645 | 0.1356 | 0.0074 | 0.0000 |
| model_idM04 | 0.3360 | 0.1316 | 0.0109 | 0.0000 |
| model_idM05 | 1.0336 | 0.1884 | 0.0000 | 0.0000 |

## Parameterized power

每次模拟保持 23 个 scene × 4 个 furniture model；被试是独立新增单位。power 使用 pilot mixed model 的固定效应估计和协方差矩阵，按候选 N 缩放信息量后生成 1,000 个多元正态固定效应抽样；power = 固定效应 p < .05 的比例。`confirmatory_block` 要求同一模型中的两个理论变量同时达到阈值。该方法是 model-based asymptotic approximation，不是把 singular mixed model 重拟合 16,000 次。

### Position error

| N | term | power | repetitions |
|---:|---|---:|---:|
| 10 | z_relationVisibilityTotal | 0.688 | 1000 |
| 10 | z_relationPerspectiveTotal | 0.452 | 1000 |
| 10 | confirmatory_block | 0.356 | 1000 |
| 15 | z_relationVisibilityTotal | 0.886 | 1000 |
| 15 | z_relationPerspectiveTotal | 0.628 | 1000 |
| 15 | confirmatory_block | 0.580 | 1000 |
| 20 | z_relationVisibilityTotal | 0.944 | 1000 |
| 20 | z_relationPerspectiveTotal | 0.754 | 1000 |
| 20 | confirmatory_block | 0.728 | 1000 |
| 25 | z_relationVisibilityTotal | 0.984 | 1000 |
| 25 | z_relationPerspectiveTotal | 0.837 | 1000 |
| 25 | confirmatory_block | 0.827 | 1000 |
| 30 | z_relationVisibilityTotal | 0.996 | 1000 |
| 30 | z_relationPerspectiveTotal | 0.921 | 1000 |
| 30 | confirmatory_block | 0.917 | 1000 |
| 40 | z_relationVisibilityTotal | 1.000 | 1000 |
| 40 | z_relationPerspectiveTotal | 0.958 | 1000 |
| 40 | confirmatory_block | 0.958 | 1000 |
| 50 | z_relationVisibilityTotal | 1.000 | 1000 |
| 50 | z_relationPerspectiveTotal | 0.987 | 1000 |
| 50 | confirmatory_block | 0.987 | 1000 |
| 60 | z_relationVisibilityTotal | 1.000 | 1000 |
| 60 | z_relationPerspectiveTotal | 0.994 | 1000 |
| 60 | confirmatory_block | 0.994 | 1000 |

### Rotation error

| N | term | power | repetitions |
|---:|---|---:|---:|
| 10 | z_featureCueVisibility | 0.324 | 1000 |
| 10 | z_asymmetricCueVisibilityAngleWeighted | 1.000 | 1000 |
| 10 | confirmatory_block | 0.324 | 1000 |
| 15 | z_featureCueVisibility | 0.424 | 1000 |
| 15 | z_asymmetricCueVisibilityAngleWeighted | 1.000 | 1000 |
| 15 | confirmatory_block | 0.424 | 1000 |
| 20 | z_featureCueVisibility | 0.531 | 1000 |
| 20 | z_asymmetricCueVisibilityAngleWeighted | 1.000 | 1000 |
| 20 | confirmatory_block | 0.531 | 1000 |
| 25 | z_featureCueVisibility | 0.633 | 1000 |
| 25 | z_asymmetricCueVisibilityAngleWeighted | 1.000 | 1000 |
| 25 | confirmatory_block | 0.633 | 1000 |
| 30 | z_featureCueVisibility | 0.713 | 1000 |
| 30 | z_asymmetricCueVisibilityAngleWeighted | 1.000 | 1000 |
| 30 | confirmatory_block | 0.713 | 1000 |
| 40 | z_featureCueVisibility | 0.838 | 1000 |
| 40 | z_asymmetricCueVisibilityAngleWeighted | 1.000 | 1000 |
| 40 | confirmatory_block | 0.838 | 1000 |
| 50 | z_featureCueVisibility | 0.929 | 1000 |
| 50 | z_asymmetricCueVisibilityAngleWeighted | 1.000 | 1000 |
| 50 | confirmatory_block | 0.929 | 1000 |
| 60 | z_featureCueVisibility | 0.962 | 1000 |
| 60 | z_asymmetricCueVisibilityAngleWeighted | 1.000 | 1000 |
| 60 | confirmatory_block | 0.962 | 1000 |

## Limitations

当前 pilot 只有少量独立 participant cluster；模型奇异性、非正态误差和低 power 都必须如实报告。其他长变量不进入确认模型，只作为预先标记的探索性变量。位置/旋转完全正确率不用于本次主要 power 结论。
