# Task Context: Build Complete Project Context

Session ID: 2026-05-25-build-project-context
Created: 2026-05-25T00:00:00+07:00
Status: completed

## Current Request
Tạo hoàn chỉnh project context ở mức sâu nhất có thể, đảm bảo mọi agent đều có đầy đủ thông tin khi cần.

## Context Files (Standards to Follow)
- .opencode/context/core/standards/code-quality.md
- .opencode/context/project-intelligence/technical-domain.md
- .opencode/context/project-intelligence/navigation.md

## Reference Files (Source Material to Look At)
- AGENTS.md
- package.json
- vite.config.js
- public/src/js/modules/core/app.js
- public/src/js/modules/core/EventManager.js
- public/src/js/modules/core/UI_Manager.js
- public/src/js/modules/core/LoginModule.js
- public/src/js/modules/core/LogicBase.js
- public/src/js/modules/core/ATable.js
- public/src/js/modules/db/DBSchema.js
- public/src/js/modules/db/DBManager.js
- public/src/js/modules/db/DBLocalStorage.js
- public/src/js/libs/utils.js
- public/src/js/libs/db_helper.js
- functions-ai/.9trip-agents/configs/prompts_master.js

## Components
1. business-domain.md (update) - Fill real business context
2. living-notes.md (update) - Fill real technical debt & issues
3. decisions-log.md (update) - Fill architecture decisions
4. erp-architecture.md (new) - Core frontend architecture deep dive
5. database-dataflow.md (new) - Database layer & data flow
6. ai-agents-system.md (new) - AI pipeline, configs, flows
7. functions-guide.md (new) - Cloud Functions patterns
8. development-guide.md (new) - Development workflow & patterns

## Constraints
- All files go in .opencode/context/project-intelligence/
- Use Vietnamese for most content, English for technical terms
- Follow existing frontmatter pattern from technical-domain.md
- Max 400 lines per file
- Focus on actionable information for AI agents

## Exit Criteria
- [x] All 8 context files created/updated with real data
- [x] navigation.md updated with new files
- [x] Each file has proper frontmatter (Context, Priority, Version, Updated)
