Execute tasks from a generated task list with stateful progress tracking.
This is the fourth step in the Spec-Driven Development lifecycle - implementing the executable tasks.

Given the (optional) context provided as an argument, do this:

1. Run `scripts/check-task-prerequisites.sh --json` from repo root and parse FEATURE_DIR and validate tasks.md exists.
2. Load and parse the tasks.md file from FEATURE_DIR:
   
   * Extract all task IDs (T001, T002, etc.)
   * Identify parallel execution groups ([P] flags)
   * Parse phase boundaries and dependencies
   * Track current completion state via checkboxes
3. Execute tasks systematically:
   
   * **Resume from last incomplete task** (support pause/resume)
   * **Respect phase boundaries** (sequential phases, parallel within phases)
   * **Execute [P] tasks concurrently** when no dependencies block them
   * **Update checkboxes atomically** after each task completion
   * **Run phase validation** after each phase completes
   * **Handle failures gracefully** with clear error reporting
4. Task execution rules (aligned with PROJECT_X Constitution):
   
   * **Never skip failed tests** - TDD is NON-NEGOTIABLE
   * **Update task file immediately** after each completion to maintain state
   * **Validate constitutional compliance** at phase boundaries
   * **Run package checks** (check:all, lint, test) before marking phases complete
   * **Maintain parallel execution logs** for debugging
   * **Preserve work on interruption** through checkbox state
5. State management patterns:
   - [ ] T001 Task description  # Pending
   - [x] T002 Task description  # Completed
   - [!] T003 Task description  # Failed (blocked)
   - [>] T004 Task description  # In Progress
6. Phase execution workflow:
   ```
   Phase 3.1: Setup & Dependencies
   ��� Load uncompleted tasks from phase
   ��� Execute sequential tasks first
   ��� Execute [P] tasks in parallel groups
   ��� Update checkboxes after each completion
   ��� Run phase validation (pnpm check:all)
   ��� Mark phase complete before proceeding
   
   Phase 3.2: Contract Tests (TDD)
   ��� CRITICAL: Tests MUST fail before implementation
   ��� Execute [P] test tasks in parallel
   ��� Verify all tests fail as expected
   ��� Update checkboxes atomically
   ��� Block progression until all tests exist and fail
   
   [Continue through all phases...]
   ```
7. Parallel execution management:
   
   * Group [P] tasks within same phase
   * Execute using Task tool with parallel agent invocations
   * Wait for completion before proceeding to next group
   * Update all completed tasks atomically
8. Error handling and recovery:
   
   * **Mark failed tasks with [!]** in checkbox
   * **Log detailed error information** in task comments
   * **Continue with non-blocked tasks** where possible
   * **Provide clear recovery guidance** for failures
   * **Never leave tasks in [>] state** on exit
9. Constitutional compliance checks:
   
   * **After each phase**: Run package validation commands
   * **Before implementation**: Verify contract tests exist and fail
   * **After implementation**: Verify contract tests pass
   * **Before completion**: Run full constitutional compliance validation
10. Implementation execution patterns:
    **For Contract Tests (Phase 3.2)**:
    # Mark as in progress
    sed -i 's/- \[ \] T005/- [>] T005/' FEATURE_DIR/tasks.md
    
    # Execute using Task agent
    Task "REDACTED"
    
    # Verify test was created and fails
    pnpm --filter=@REDACTED
    
    # Mark as complete
    sed -i 's/- \[>\] T005/- [x] T005/' FEATURE_DIR/tasks.md
        
          
        
    
          
        
    
        
      
    **For Service Implementation (Phase 3.4)**:
    # Mark as in progress
    sed -i 's/- \[ \] T018/- [>] T018/' FEATURE_DIR/tasks.md
    
    # Execute implementation task
    Task "REDACTED"
    
    # Verify implementation
    pnpm --filter=@REDACTED
    
    # Mark as complete
    sed -i 's/- \[>\] T018/- [x] T018/' FEATURE_DIR/tasks.md
        
          
        
    
          
        
    
        
      
    **For Parallel Execution Groups**:
    # Mark multiple [P] tasks as in progress
    sed -i 's/- \[ \] T014/- [>] T014/' FEATURE_DIR/tasks.md
    sed -i 's/- \[ \] T015/- [>] T015/' FEATURE_DIR/tasks.md
    sed -i 's/- \[ \] T016/- [>] T016/' FEATURE_DIR/tasks.md
    
    # Execute in parallel using multiple Task invocations
    Task "REDACTED" &
    Task "REDACTED" &
    Task "REDACTED" &
    wait
    
    # Mark all as complete
    sed -i 's/- \[>\] T014/- [x] T014/' FEATURE_DIR/tasks.md
    sed -i 's/- \[>\] T015/- [x] T015/' FEATURE_DIR/tasks.md
    sed -i 's/- \[>\] T016/- [x] T016/' FEATURE_DIR/tasks.md
11. Progress reporting:
    
    * Display current phase and progress percentage
    * Show parallel execution status
    * Report validation results
    * Log all Task agent outputs
    * Maintain execution timeline
12. Completion criteria:
    
    * All tasks marked [x] in tasks.md
    * All phases validated successfully
    * Constitutional compliance checks passed
    * All package validation commands successful
    * Performance and security requirements verified
13. Resume capability:
    
    * Parse tasks.md to find last completed task
    * Resume from first [ ] or [!] task
    * Respect phase boundaries (don't skip phases)
    * Re-run failed tasks marked [!]
    * Continue parallel groups from interruption point

Context for implementation: $ARGUMENTS

The implementation should be fully autonomous - execute tasks, update state, handle errors, and provide clear progress reporting until all tasks are complete or blocked on unresolvable issues.
