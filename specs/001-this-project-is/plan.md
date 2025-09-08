# Implementation Plan: Telegram to WhatsApp Chat Import CLI Tool

**Branch**: `001-this-project-is` | **Date**: 2025-09-08 | **Spec**: [/specs/001-this-project-is/spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-this-project-is/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
4. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
5. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, or `GEMINI.md` for Gemini CLI).
6. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
7. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
8. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
A NodeJS CLI tool that imports Telegram chat exports to WhatsApp using whatsapp-web.js. Features two-phase execution: 1) Generate reviewable import plan from result.json, 2) Execute plan with idempotent, resumable import including rate limiting and progress tracking.

## Technical Context
**Language/Version**: Node.js latest LTS (v20+)  
**Primary Dependencies**: whatsapp-web.js, commander (CLI framework)  
**Storage**: File-based (JSON files for plans, progress, skipped messages)  
**Testing**: Jest for unit/integration testing  
**Target Platform**: Cross-platform CLI (Windows, macOS, Linux)
**Project Type**: single - CLI tool
**Performance Goals**: Handle large exports (1000+ messages), resumable imports  
**Constraints**: Rate limiting (3-10s delays), WhatsApp connection stability, media file handling  
**Scale/Scope**: Process Telegram exports up to thousands of messages with media files

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 1 (cli tool)
- Using framework directly? Yes (commander.js, whatsapp-web.js)
- Single data model? Yes (message/media structures)
- Avoiding patterns? Yes (direct file operations, no unnecessary abstractions)

**Architecture**:
- EVERY feature as library? Yes - core logic as libraries, CLI as thin wrapper
- Libraries listed: telegram-parser, whatsapp-importer, plan-generator, progress-tracker
- CLI per library: Yes - plan/execute commands with --help/--version/--format
- Library docs: llms.txt format planned? Yes

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? Yes
- Git commits show tests before implementation? Will enforce
- Order: Contract→Integration→E2E→Unit strictly followed? Yes
- Real dependencies used? Yes (actual file system, real Telegram exports)
- Integration tests for: new libraries, contract changes, shared schemas? Yes
- FORBIDDEN: Implementation before test, skipping RED phase

**Observability**:
- Structured logging included? Yes (console output + file logs)
- Frontend logs → backend? N/A (CLI only)
- Error context sufficient? Yes (detailed error messages)

**Versioning**:
- Version number assigned? 1.0.0
- BUILD increments on every change? Yes
- Breaking changes handled? Yes (semantic versioning)

## Project Structure

### Documentation (this feature)
```
specs/001-this-project-is/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/
```

**Structure Decision**: Option 1 - Single project (CLI tool)

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - Commander.js best practices for CLI building
   - whatsapp-web.js integration patterns and authentication
   - File system operations for cross-platform compatibility
   - Rate limiting and retry strategies for WhatsApp
   - JSON schema validation for Telegram exports

2. **Generate and dispatch research agents**:
   ```
   Task: "Research commander.js best practices for building Node.js CLI tools"
   Task: "Research whatsapp-web.js authentication and message sending patterns"
   Task: "Research file system best practices for cross-platform Node.js CLI tools"
   Task: "Research rate limiting and retry strategies for WhatsApp automation"
   Task: "Research JSON schema validation libraries for Node.js"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all technical decisions documented

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - TelegramMessage, WhatsAppMessage, MediaFile, ImportPlan, ProgressRecord
   - Validation rules from FR requirements
   - State transitions (pending → processing → sent → failed)

2. **Generate API contracts** from functional requirements:
   - CLI command interfaces (plan, execute)
   - File format contracts (JSON schemas)
   - Progress tracking contracts
   - Output OpenAPI-style documentation to `/contracts/`

3. **Generate contract tests** from contracts:
   - CLI command argument parsing tests
   - File format validation tests
   - Progress tracking behavior tests
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Plan generation from Telegram export
   - Import execution with progress tracking  
   - Idempotent restart scenarios
   - Rate limiting behavior

5. **Update agent file incrementally**:
   - Run `/scripts/update-agent-context.sh claude` 
   - Add Node.js, commander.js, whatsapp-web.js context
   - Include CLI patterns and testing approaches
   - Output to repository root as `CLAUDE.md`

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, CLAUDE.md

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- Each CLI command → contract test task [P]
- Each entity (Message, Plan, Progress) → model creation task [P] 
- Each user story → integration test task
- Implementation tasks to make tests pass

**Ordering Strategy**:
- TDD order: Tests before implementation 
- Dependency order: Models before services before CLI
- Mark [P] for parallel execution (independent files)

**Estimated Output**: 25-30 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

No constitutional violations identified.

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented

---
*Based on Constitution v2.1.1 - See `/memory/constitution.md`*