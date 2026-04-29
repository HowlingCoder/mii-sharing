# Claude Code Global Rules

## Behavior
- Never spawn sub-agents unless explicitly asked
- Ask before reading files not directly related to the current task
- Ask before installing or updating packages
- Ask before creating new files
- If unsure about scope: ask, don't assume
- Keep responses concise – no large file dumps into chat

## Efficiency
- Don't read files you don't need to edit
- Summarize findings instead of dumping full file contents
- If a task requires more than 5 file reads, ask first before proceeding
- Prefer targeted edits over full file rewrites

## Commands
- Ask before running any command that wasn't explicitly requested
- Never run destructive commands (`rm`, `drop`, `delete`, `truncate`) without confirmation
- No dependency updates unless explicitly asked

## Code Style
- TypeScript: strict mode, no `any` types
- Comments in English
- No large refactors unless explicitly asked
- No unrelated cleanup or formatting changes while working on a task

## Never do this
- No sub-agents / Task tool unless explicitly requested
- No exploring the whole project on startup
- No installing packages without asking
- Do not wait for pnpm push 2>&1 
