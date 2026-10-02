# Release Deployment Memory

The participant-facing static packages are published to:

- Repository: `https://github.com/eastnoob/layout-task-run12-core23-chinese-release.git`
- `main`: Chinese web package (`zh-CN`)
- `en-US`: English web package (`en-US`)

Every participant-facing modification must be built and synchronized to both
branches when the change applies to both languages. The repository root must
contain the built `dist/` contents directly, not the source repository or a
nested `dist/` directory. Keep the source repository branches
`release/zh-CN` and `release/en-US` synchronized with the corresponding web
package branches.
