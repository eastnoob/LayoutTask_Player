#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(lme4)
  library(lmerTest)
})

args <- commandArgs(trailingOnly = TRUE)
arg <- function(name, default = NULL) {
  i <- match(name, args)
  if (is.na(i)) default else args[[i + 1L]]
}

data_path <- arg("--data")
output_dir <- arg("--out", "analysis/reports/preregistered-models")
repetitions <- as.integer(arg("--reps", "1000"))
if (is.null(data_path) || !file.exists(data_path)) stop("--data scored stimulus-observations.csv is required")
if (is.na(repetitions) || repetitions < 1L) stop("--reps must be positive")
dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

data <- read.csv(data_path, check.names = FALSE, stringsAsFactors = FALSE)
required <- c("participant_id", "task_id", "model_id", "position_error", "rotation_error_steps", "relationVisibilityTotal", "relationPerspectiveTotal", "featureCueVisibility", "asymmetricCueVisibilityAngleWeighted")
missing <- setdiff(required, names(data))
if (length(missing)) stop("missing columns: ", paste(missing, collapse = ", "))
data <- data[is.finite(data$position_error) & is.finite(data$rotation_error_steps), , drop = FALSE]
data$participant_id <- factor(data$participant_id)
data$task_id <- factor(data$task_id)
data$model_id <- factor(data$model_id)

# Standardisation is fixed from the stimulus design rows, not from outcome values.
template <- data[!duplicated(data[c("task_id", "model_id")]), , drop = FALSE]
scale_from_design <- function(value) as.numeric((value - mean(value)) / sd(value))
for (name in c("relationVisibilityTotal", "relationPerspectiveTotal", "featureCueVisibility", "asymmetricCueVisibilityAngleWeighted")) {
  data[[paste0("z_", name)]] <- scale_from_design(data[[name]])
  template[[paste0("z_", name)]] <- scale_from_design(template[[name]])
}

position_formula <- position_error ~ z_relationVisibilityTotal + z_relationPerspectiveTotal + model_id + (1 | participant_id) + (1 | task_id)
rotation_formula <- rotation_error_steps ~ z_featureCueVisibility + z_asymmetricCueVisibilityAngleWeighted + model_id + (1 | participant_id) + (1 | task_id)
fit_model <- function(formula, data) suppressMessages(suppressWarnings(lmerTest::lmer(
  formula,
  data = data,
  REML = FALSE,
  control = lme4::lmerControl(optimizer = "nloptwrap", calc.derivs = FALSE, check.conv.singular = "ignore")
)))
fits <- list(position = fit_model(position_formula, data), rotation = fit_model(rotation_formula, data))

model_rows <- do.call(rbind, lapply(names(fits), function(name) {
  fit <- fits[[name]]
  coefficients <- as.data.frame(coef(summary(fit)))
  coefficients$term <- rownames(coefficients)
  rownames(coefficients) <- NULL
  names(coefficients) <- c("estimate", "std_error", "df", "t_value", "p_value", "term")
  coefficients$model <- name
  coefficients$singular <- lme4::isSingular(fit, tol = 1e-4)
  coefficients[, c("model", "term", "estimate", "std_error", "df", "t_value", "p_value", "singular")]
}))
write.csv(model_rows, file.path(output_dir, "model-summary.csv"), row.names = FALSE)

random_sd <- function(fit, group) {
  values <- lme4::VarCorr(fit)
  if (!group %in% names(values)) return(0)
  as.numeric(attr(values[[group]], "stddev"))
}

power_for <- function(fit, n, terms, reps) {
  # Approximate model-based power: scale the fitted mixed-model information by N,
  # then draw fixed-effect estimates from its multivariate normal asymptotic law.
  # This avoids pretending that thousands of singular refits are more trustworthy.
  pilot_n <- nlevels(data$participant_id)
  coefficient_names <- names(fixef(fit))
  if (!all(terms %in% coefficient_names)) stop("missing model terms: ", paste(setdiff(terms, coefficient_names), collapse = ", "))
  beta <- fixef(fit)[terms]
  covariance <- as.matrix(vcov(fit)[terms, terms, drop = FALSE]) * pilot_n / n
  standard_errors <- sqrt(diag(covariance))
  chol_covariance <- chol(covariance)
  draws <- matrix(rnorm(reps * length(terms)), nrow = reps) %*% chol_covariance
  draws <- sweep(draws, 2, beta, "+")
  p_values <- 2 * pnorm(-abs(sweep(draws, 2, standard_errors, "/")))
  data.frame(n = n, term = c(terms, "confirmatory_block"), power = c(colMeans(p_values < 0.05), mean(rowSums(p_values < 0.05) == length(terms))), repetitions = reps)
}

set.seed(20260929)
candidates <- c(10L, 15L, 20L, 25L, 30L, 40L, 50L, 60L)
power <- rbind(
  do.call(rbind, lapply(candidates, power_for, fit = fits$position, terms = c("z_relationVisibilityTotal", "z_relationPerspectiveTotal"), reps = repetitions)),
  do.call(rbind, lapply(candidates, power_for, fit = fits$rotation, terms = c("z_featureCueVisibility", "z_asymmetricCueVisibilityAngleWeighted"), reps = repetitions))
)
power$outcome <- c(rep("position_error", nrow(power) / 2), rep("rotation_error_steps", nrow(power) / 2))
power <- power[, c("outcome", "n", "term", "power", "repetitions")]
write.csv(power, file.path(output_dir, "mixed-model-power.csv"), row.names = FALSE)

render_power <- function(outcome) {
  subset <- power[power$outcome == outcome, ]
  paste(apply(subset, 1, function(row) sprintf("| %s | %s | %.3f | %s |", row[["n"]], row[["term"]], as.numeric(row[["power"]]), row[["repetitions"]])), collapse = "\n")
}
render_model <- function(name) {
  subset <- model_rows[model_rows$model == name, ]
  paste(apply(subset, 1, function(row) sprintf("| %s | %.4f | %.4f | %.4f | %.4f |", row[["term"]], as.numeric(row[["estimate"]]), as.numeric(row[["std_error"]]), as.numeric(row[["p_value"]]), as.logical(row[["singular"]]))), collapse = "\n")
}

report <- paste0(
  "# 预注册刺激变量模型与 power analysis\n\n",
  "## Confirmatory specification\n\n",
  "位置模型：`position_error ~ z_relationVisibilityTotal + z_relationPerspectiveTotal + model_id + (1|participant_id) + (1|task_id)`。\n\n",
  "旋转模型：`rotation_error_steps ~ z_featureCueVisibility + z_asymmetricCueVisibilityAngleWeighted + model_id + (1|participant_id) + (1|task_id)`。\n\n",
  "变量方向在分析前固定：relation 变量用于位置；feature 与 asymmetric cue 变量用于旋转。没有按 pilot p 值挑变量。标准化参数只来自刺激设计矩阵。\n\n",
  "## Pilot fit\n\n",
  "| term | estimate | std. error | p-value | singular |\n|---|---:|---:|---:|---|\n",
  render_model("position"), "\n\n",
  "| term | estimate | std. error | p-value | singular |\n|---|---:|---:|---:|---|\n",
  render_model("rotation"), "\n\n",
  "## Parameterized power\n\n",
  "每次模拟保持 23 个 scene × 4 个 furniture model；被试是独立新增单位。power 使用 pilot mixed model 的固定效应估计和协方差矩阵，按候选 N 缩放信息量后生成 1,000 个多元正态固定效应抽样；power = 固定效应 p < .05 的比例。`confirmatory_block` 要求同一模型中的两个理论变量同时达到阈值。该方法是 model-based asymptotic approximation，不是把 singular mixed model 重拟合 16,000 次。\n\n",
  "### Position error\n\n| N | term | power | repetitions |\n|---:|---|---:|---:|\n", render_power("position_error"), "\n\n",
  "### Rotation error\n\n| N | term | power | repetitions |\n|---:|---|---:|---:|\n", render_power("rotation_error_steps"), "\n\n",
  "## Limitations\n\n",
  "当前 pilot 只有少量独立 participant cluster；模型奇异性、非正态误差和低 power 都必须如实报告。其他长变量不进入确认模型，只作为预先标记的探索性变量。位置/旋转完全正确率不用于本次主要 power 结论。\n"
)
writeLines(report, file.path(output_dir, "preregistered-model-report.md"))
cat(sprintf("wrote %s; participants=%d; rows=%d\n", output_dir, nlevels(data$participant_id), nrow(data)))
