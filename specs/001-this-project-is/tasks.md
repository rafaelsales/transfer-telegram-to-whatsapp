# Tasks: Telegram to WhatsApp CLI Tool

**Input**: Design documents from `/specs/001-this-project-is/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → Found: Node.js CLI tool with Commander.js + whatsapp-web.js
   → Extract: tech stack, libraries, structure (single project)
2. Load optional design documents:
   → data-model.md: 6 entities → model tasks
   → contracts/: 2 files → contract test tasks
   → research.md: 8 decisions → setup tasks
3. Generate tasks by category:
   → Setup: Node.js project, Commander.js, whatsapp-web.js, Jest
   → Tests: CLI contract tests, file format tests
   → Core: models, services, CLI commands
   → Integration: WhatsApp connection, progress tracking
   → Polish: unit tests, performance, docs
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → CLI contracts have tests ✓
   → All entities have models ✓
   → All commands implemented ✓
9. Return: SUCCESS (31 tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
Single project structure from plan.md:
- **Source**: `src/models/`, `src/services/`, `src/cli/`, `src/lib/`
- **Tests**: `tests/contract/`, `tests/integration/`, `tests/unit/`

## Phase 3.1: Setup
- [x] T001 Create Node.js project structure with ES modules support
- [x] T002 Initialize package.json with Commander.js, whatsapp-web.js, Jest dependencies
- [x] T003 [P] Configure ESLint and Prettier for Node.js ES modules
- [x] T004 [P] Set up Jest configuration for ES modules testing
- [x] T005 [P] Create basic CLI entry point in src/cli/index.js with Commander.js

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Contract Tests
- [x] T006 [P] CLI contract test for `plan` command in tests/contract/test_plan_command.js
- [x] T007 [P] CLI contract test for `execute` command in tests/contract/test_execute_command.js
- [x] T008 [P] File format validation test for ImportPlan schema in tests/contract/test_import_plan_schema.js
- [x] T009 [P] File format validation test for ProgressRecord schema in tests/contract/test_progress_schema.js

### Integration Tests
- [x] T010 [P] Integration test for complete plan generation workflow in tests/integration/test_plan_generation.js
- [x] T011 [P] Integration test for WhatsApp import execution in tests/integration/test_whatsapp_import.js
- [x] T012 [P] Integration test for idempotent resume functionality in tests/integration/test_resume_import.js
- [x] T013 [P] Integration test for rate limiting behavior in tests/integration/test_rate_limiting.js

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Data Models
- [x] T014 [P] TelegramMessage model with validation in src/models/TelegramMessage.js
- [x] T015 [P] WhatsAppMessage model with validation in src/models/WhatsAppMessage.js
- [x] T016 [P] ImportPlan model with validation in src/models/ImportPlan.js
- [x] T017 [P] ProgressRecord model with validation in src/models/ProgressRecord.js
- [x] T018 [P] CLIConfig model with validation in src/models/CLIConfig.js

### Core Services
- [x] T019 [P] TelegramParser service in src/services/TelegramParser.js
- [x] T020 [P] PlanGenerator service in src/services/PlanGenerator.js
- [x] T021 WhatsAppImporter service in src/services/WhatsAppImporter.js
- [x] T022 ProgressTracker service in src/services/ProgressTracker.js
- [x] T023 [P] MediaValidator service in src/services/MediaValidator.js

### CLI Commands
- [x] T024 Plan command implementation in src/cli/commands/PlanCommand.js
- [x] T025 Execute command implementation in src/cli/commands/ExecuteCommand.js

### Shared Libraries
- [x] T026 [P] File system utilities in src/lib/FileUtils.js
- [x] T027 [P] JSON schema validation in src/lib/SchemaValidator.js

## Phase 3.4: Integration
- [x] T028 WhatsApp client connection management in WhatsAppImporter
- [x] T029 Rate limiting implementation with configurable delays
- [x] T030 Error handling and retry logic integration
- [x] T031 Progress tracking with atomic file operations

## Phase 3.5: Polish
- [x] T032 [P] Unit tests for TelegramParser in tests/unit/test_telegram_parser.js
- [x] T033 [P] Unit tests for PlanGenerator in tests/unit/test_plan_generator.js
- [x] T034 [P] Unit tests for MediaValidator in tests/unit/test_media_validator.js
- [x] T035 [P] Unit tests for file utilities in tests/unit/test_file_utils.js
- [x] T036 Performance tests for large exports (1000+ messages)
- [x] T037 Cross-platform compatibility tests (Windows, macOS, Linux)
- [x] T038 [P] Update CLAUDE.md with final implementation context
- [x] T039 Remove code duplication and optimize imports
- [ ] T040 Execute manual testing scenarios from quickstart.md

## Dependencies

### Critical Path
- Setup (T001-T005) before everything
- All contract tests (T006-T009) before any models
- All integration tests (T010-T013) before any services
- Models (T014-T018) before services (T019-T025)
- Services before CLI commands (T024-T025)

### Specific Dependencies
- T021 (WhatsAppImporter) blocks T028, T029, T030
- T022 (ProgressTracker) blocks T031
- T024, T025 (CLI commands) block T038 (CLAUDE.md update)
- All implementation before polish (T032-T040)

## Parallel Example
```
# Phase 3.2 - Launch contract tests together:
Task: "CLI contract test for plan command in tests/contract/test_plan_command.js"
Task: "CLI contract test for execute command in tests/contract/test_execute_command.js" 
Task: "File format validation test for ImportPlan schema in tests/contract/test_import_plan_schema.js"
Task: "File format validation test for ProgressRecord schema in tests/contract/test_progress_schema.js"

# Phase 3.3 - Launch model creation together:
Task: "TelegramMessage model with validation in src/models/TelegramMessage.js"
Task: "WhatsAppMessage model with validation in src/models/WhatsAppMessage.js"
Task: "ImportPlan model with validation in src/models/ImportPlan.js"
Task: "ProgressRecord model with validation in src/models/ProgressRecord.js"
Task: "CLIConfig model with validation in src/models/CLIConfig.js"
```

## Notes
- [P] tasks = different files, no dependencies
- Verify tests fail before implementing (RED-GREEN-Refactor)
- Commit after each task completion
- Follow Commander.js patterns for CLI structure
- Use whatsapp-web.js LocalAuth for persistent sessions
- Implement atomic file operations for progress tracking
- Include comprehensive error handling with exit codes per CLI contract

## Task Generation Rules
*Applied during main() execution*

1. **From Contracts**:
   - CLI interface contract → 2 command tests (T006-T007)
   - File formats contract → 2 schema tests (T008-T009)
   
2. **From Data Model**:
   - 6 entities → 5 model tasks [P] (T014-T018)
   - Complex relationships → service layer tasks (T019-T025)
   
3. **From Quickstart**:
   - Plan generation workflow → integration test (T010)
   - Import execution workflow → integration test (T011)
   - Resume functionality → integration test (T012)
   - Rate limiting → integration test (T013)

4. **Ordering**:
   - Setup → Tests → Models → Services → CLI → Integration → Polish
   - WhatsApp dependencies managed through service layer

## Validation Checklist
*GATE: Checked by main() before returning*

- [x] All CLI contracts have corresponding tests (T006-T007)
- [x] All file format contracts have schema tests (T008-T009)
- [x] All entities have model tasks (T014-T018)
- [x] All quickstart scenarios have integration tests (T010-T013)
- [x] All tests come before implementation (T006-T013 before T014+)
- [x] Parallel tasks truly independent (different files, no shared state)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Commander.js patterns followed for CLI structure
- [x] WhatsApp integration properly abstracted in services
- [x] Progress tracking designed for idempotent operations