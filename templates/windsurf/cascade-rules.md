# Context Mode Rules for Windsurf Cascade

## Purpose
Route large tool outputs through context-mode to preserve the context window and reduce token costs.

## When to Use Context-Mode Tools

### Use `context-mode.execute` instead of direct shell commands for:
- `git log`, `git diff --stat`, `git show`, `git blame`
- `npm list`, `yarn why`, `pip list`, `cargo tree`, `dotnet list package`
- `cat` of files > 200 lines
- `find` with large result sets
- Test suite runners producing > 50 lines of output
- `docker ps`, `docker logs`, `kubectl get pods`

### Use `context-mode.execute_file` for large files:
- JSON files > 50KB (package-lock.json, large configs)
- Log files
- Any binary that prints to stdout

### Use `context-mode.fetch_and_index` + `context-mode.search` for documentation:
- Library documentation pages
- API references
- README files from GitHub

### Use `context-mode.compress` for any large text you already have in context

## Code Examples

```javascript
// Large git history — only return relevant commits
execute({
  language: "shell",
  code: "git log --oneline -100",
  intent: "find commits related to authentication bug"
})

// Large file analysis without loading it
execute_file({
  file_path: "/path/to/large.json",
  code: `
    const d = JSON.parse(process.env.FILE_CONTENT);
    console.log('Keys:', Object.keys(d).join(', '));
    console.log('Items:', Array.isArray(d) ? d.length : 'N/A');
  `
})

// Index docs, then search
fetch_and_index({ url: "https://angular.io/docs", kb_name: "angular" })
search({ query: "standalone components migration", kb_name: "angular" })

// Compress large API response
compress({
  content: hugeApiResponse,
  intent: "find error status and error message fields"
})
```

## Savings Report
Call `context-mode.report` anytime to see total tokens saved and verify context-mode is working.
