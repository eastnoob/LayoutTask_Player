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

The root entry in both web branches must redirect to the current `/experiment/`
entry. Do not publish the legacy standalone `layout-task/` package as the root
application. The experiment entry requires the R12 persistent package.

Deployment rule: generate the web package from a fresh `dist/` build; never
incrementally retain files from an older static checkout. Before pushing both
language branches, validate an archive-style copy without `.git`, recursively
check every declared asset reference, and load the tutorial in WebKit with no
404 or failed requests.
