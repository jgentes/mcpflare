## name: release

Create a new release by analyzing commits, determining version bump, generating changelog, and publishing.

### Instructions for AI:

1. **Get commits since last tag:**
   ```bash
   git log $(git describe --tags --abbrev=0)..HEAD --oneline
   ```
   If no tags exist, get all commits.

2. **Analyze commits to determine version bump:**
   - **MAJOR**: Breaking changes (commits containing "BREAKING CHANGE" or type with "!")
   - **MINOR**: New features (commits starting with "feat:" or "feat(")
   - **PATCH**: Everything else (fix:, docs:, chore:, refactor:, style:, test:, ci:, etc.)

3. **Generate a changelog entry** in this format:
   ```markdown
   ## [X.Y.Z] - YYYY-MM-DD

   ### Added
   - New features from feat: commits

   ### Changed
   - Changes from refactor:, style: commits

   ### Fixed
   - Bug fixes from fix: commits

   ### Other
   - Docs, tests, CI changes
   ```
   Only include sections that have entries. Write human-readable summaries, not just commit messages.

4. **Update CHANGELOG.md:**
   - Prepend the new entry after the title/header
   - Keep existing entries

5. **Bump version:**
   ```bash
   npm version [major|minor|patch] -m "chore: release v%s"
   ```
   This automatically:
   - Updates package.json version
   - Runs postversion hook (syncs VSCode extension version)
   - Creates a git commit and tag

6. **Push to trigger CI publish:**
   ```bash
   git push && git push --tags
   ```

7. **Report to user:**
   - What version was released
   - Summary of changes
   - Link to GitHub Actions (the tag push triggers npm publish)

### Notes:
- The pre-push hook will run tests before pushing
- CI will automatically publish to npm when it sees the version tag
- If tests fail, fix them and run `/release` again
