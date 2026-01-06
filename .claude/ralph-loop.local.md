---
active: true
iteration: 1
max_iterations: 8
completion_promise: null
started_at: "2026-01-06T12:37:28Z"
---

Cleanup only. Remove all duplicate and redundant files. The app is already enterprise-ready—do not do unrelated refactors.

MANDATORY: Check EVERY file in the repo.
- Generate FILE_INVENTORY.md that lists every tracked file path (one per line), grouped by folder.
- For EACH file add a table row in FILE_DECISIONS.md with:
  1) Path
  2) Purpose (1 line)
  3) Keep/Delete
  4) Reason (duplicate/redundant/unused/obsolete/backup/temp)
  5) If deleted: replacement canonical path (or 'none')
  6) References updated? (yes/no)

CLEANUP RULES:
- Delete duplicates: same responsibility implemented in multiple places, old versions, forks, copies, v1/v2, backup/tmp/(1) artifacts.
- Delete dead code/files not referenced by builds/runtime/tests/docs.
- Consolidate duplicated logic into a single canonical source of truth and update imports.
- Do NOT delete necessary build/deploy infra (CI, Docker, config templates) unless clearly redundant.

DELIVERABLES:
- FILE_INVENTORY.md (complete list of all files after cleanup)
- FILE_DECISIONS.md (decision logged for every file that existed at start)
- CLEANUP.md summary: what was removed/merged and why

EXIT ONLY WHEN:
1) All tests pass
2) FILE_DECISIONS.md covers 100% of the files that existed at the start of this loop
3) No duplicate/redundant files remain
4) Output <promise>CLEANUP_COMPLETE</promise>
