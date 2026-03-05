# Context-Mode Instructions for GitHub Copilot

## When working with large outputs

Route large tool outputs through context-mode MCP tools to preserve the context window.

### For shell commands producing large output
```
context-mode.execute({
  language: "shell",
  code: "git log --oneline -50",
  intent: "find commits related to the bug fix"
})
```

### For large files
```
context-mode.execute_file({
  file_path: "/absolute/path/to/file.json",
  code: "const d = JSON.parse(process.env.FILE_CONTENT); console.log(Object.keys(d).join(', '))"
})
```

### For documentation
Fetch and index, then search:
```
context-mode.fetch_and_index({ url: "https://docs.example.com" })
context-mode.search({ query: "relevant topic" })
```

### For any large text
```
context-mode.compress({ content: largeText, intent: "find error messages" })
```

## Commands that often produce large output
- git log, git diff, git show
- npm list, yarn why, pip list, cargo tree
- cat on files > 200 lines
- find with many results
- Test suite output
- API responses

### Check savings report
Use `context-mode.report` anytime to see how much context was saved this session and verify the plugin is working:
```
context-mode.report()
```
