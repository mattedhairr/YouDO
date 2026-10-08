# Handoff Report: Test Infrastructure & 4-Tier Test Plan for Blueprint Studio Rebuild

**Agent**: Test Infra Explorer  
**Working Directory**: `d:\Production\Projects\YouDO\.agents\teamwork\explorer_survey_2`  
**Target Milestone**: Blueprint Studio Goal Tree Editor & Bulk Editing Rebuild (R1–R5)  
**Parent Conversation ID**: `b50e5d61-aab8-4da0-9abc-a466bca2446b`  

---

## 1. Observation

1. **Framework & Platform**:
   - `package.json` contains `"name": "youdo"`, `"version": "7.7.2"`, `"dependencies"` including `react: "^18.3.1"`, `@capacitor/core: "^8.5.0"`, `@supabase/supabase-js: "^2.57.4"`, and `"devDependencies"` including `vite: "6.4.3"`, `vitest: "4.1.11"`, `typescript: "5.5.3"`.
   - The project is a React 18 / TypeScript / Vite application, **not** Flutter.

2. **Test Discovery & Execution**:
   - `vite.config.ts` (lines 114–117):
     ```ts
     test: {
       environment: 'node',
       include: ['src/**/*.test.ts'],
     },
     ```
   - Running `npm test` runs `vitest run`.
   - Actual test run output:
     ```
     Test Files  44 passed (44)
          Tests  464 passed (464)
       Duration  5.06s
     ```
   - Running single suite `npx vitest run src/lib/blueprintStudio.test.ts`:
     ```
     Test Files  1 passed (1)
          Tests  18 passed (18)
       Duration  483ms
     ```
   - Running single suite `npx vitest run src/lib/studioWorkspace.test.ts`:
     ```
     Test Files  1 passed (1)
          Tests  20 passed (20)
       Duration  470ms
     ```

3. **Existing Blueprint Studio Logic & Tests**:
   - `src/lib/blueprintStudio.ts` (408 lines) implements `addBlueprintChildren` (lines 60–92), `addBlueprintSteps` (lines 108–138), `removeBlueprintSteps` (lines 141–183), `updateBlueprintNodes` (lines 204–218), `groupBlueprintChildren` (lines 360–379), `reconcileBlueprintTasks` (lines 386–407).
   - `src/lib/studioWorkspace.ts` implements `patchStudioItems`, `moveStudioItems`, `duplicateStudioItems`, `editStudioSteps`, `topStudioSelection`.
   - `src/lib/blueprintStudio.test.ts` (235 lines) and `src/lib/studioWorkspace.test.ts` (183 lines) test existing tree operations and step addition/removal.

4. **Component & UI Test Tools**:
   - `src/components/Toggle.test.ts` tests React components in Node environment using `renderToStaticMarkup` from `react-dom/server`.
   - `npm ls jsdom happy-dom @testing-library/react` returned empty (`-- (empty)`). Interactive DOM test runners are not installed.

5. **Typecheck & Lint Environment Status**:
   - Running `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`) exited with code 1 due to 4 unused variable warnings (`TS6133` with `noUnusedLocals: true`):
     - `src/App.tsx(2,70)`: `'Zap'`
     - `src/App.tsx(121,5)`: `'duplicateTask'`
     - `src/App.tsx(815,9)`: `'handlePushBacklogTask'`
     - `src/components/TaskCard.tsx(2,27)`: `'Copy'`
   - Running `npm run lint` (`eslint .`) reported the same 4 unused variables plus a React hook dependency warning in `src/components/studio/StudioForms.tsx(71,6)`.
   - SQL test suite (`npm run test:sql`) ran with `@electric-sql/pglite` and all 8 test suites passed.
   - Benchmark suite (`npm run benchmark`) ran with Vitest benchmarks and passed 5 synthetic benchmarks over 5,510 tree nodes in 3.3s.

---

## 2. Logic Chain

1. **Test Runner Feasibility** (from Observation 1 & 2):
   Because Vitest 4.1.11 is configured and fully functional, executing all 464 tests across 44 files in ~5 seconds, tests for the rebuilt Blueprint Studio can be authored using standard Vitest syntax (`describe`, `it`, `expect`) and executed via `npm test` or `npx vitest run`.

2. **Core Algorithm Testability** (from Observation 3):
   Because the core tree transformations (bulk adding children, set-union step addition, set-difference step removal, date patching, and Today plan reconciliation) are implemented as pure TypeScript functions in `src/lib/`, they can be tested directly with 100% deterministic reproducibility, zero network/database dependency, and execution speed under 500ms.

3. **UI/UX Testing Strategy** (from Observation 4):
   Because interactive DOM libraries (`jsdom`/`happy-dom`/`testing-library`) are not installed and Vitest runs under `environment: 'node'`, attempting to mount interactive React DOM components directly in Node would fail. Therefore, the optimal testing strategy is:
   - Primary: Decouple the UI state machine into a headless reducer/controller module (e.g. `blueprintStudioReducer.ts`) where multi-selection, node expansion choices, dirty states, and draft transactions are unit-tested in Node.
   - Secondary: Use `react-dom/server`'s `renderToStaticMarkup` (as demonstrated in `src/components/Toggle.test.ts`) to verify rendered component HTML, ARIA attributes, modal structures, and button states.

4. **Requirements Coverage (R1–R5)** (from Observation 3 & 4):
   - R1 (Node expansion choice): Verified at model level (empty node + steps => Task endpoint; empty node + children => Branch folder) and controller/UI level.
   - R2 (Bulk Add Inside): Verified via multi-parent targeting, sibling title collision skipping, and batch ID generation.
   - R3 (Bulk Step Editing Diffing): Verified via formal Set-Union (addition skips existing steps, preserves completion states) and Set-Difference (removal removes unfinished steps, skips non-existent steps without throwing errors, protects completed steps).
   - R4 (Bulk Date Changing): Verified via `patchStudioItems` updating single nodes or multiple nodes simultaneously, enforcing `endDate >= startDate`.
   - R5 (Simple UI/UX): Verified via layout structure tests, modal lifecycle tests, and draft transaction undo/redo stacks.

5. **Environment Readiness** (from Observation 5):
   The environment is ready for test execution (`npm test` passes). However, implementers must be aware that `npm run typecheck` currently flags 4 pre-existing unused variable warnings in `App.tsx` and `TaskCard.tsx`.

---

## 3. Caveats

1. **Pre-existing Unused Variables in App.tsx / TaskCard.tsx**:
   `npm run typecheck` fails due to 4 unused variables in non-Studio files (`src/App.tsx` and `src/components/TaskCard.tsx`). This does not affect Vitest execution (`npm test`), but must be cleaned up or excluded if CI mandates `npm run typecheck`.
2. **Vite Test File Glob**:
   `vite.config.ts` configures `include: ['src/**/*.test.ts']`. Any new test file authored with `.test.tsx` will not be discovered by Vitest unless `vite.config.ts` is updated to include `*.test.{ts,tsx}` or new test files are saved as `.test.ts`.
3. **No Interactive Browser Automation (Playwright/Cypress)**:
   The repository does not currently have Playwright, Cypress, or Puppeteer installed. End-to-end user workflows (Tier 4) are validated through headless scenario runners simulating user actions on the domain models and state store.

---

## 4. Conclusion

1. **Test Infrastructure is Healthy and Ready**: Vitest is installed, fast (~5s for 464 tests), and well-integrated. All existing 44 test suites pass.
2. **Strategy for Blueprint Studio Rebuild**:
   - Place pure algorithmic functions in `src/lib/blueprintStudio.ts` (or equivalent) tested via `src/lib/blueprintStudio.test.ts`.
   - Place state machine logic in a decoupled controller/reducer tested under `src/components/studio/*.test.ts`.
   - Use `react-dom/server` for static markup and accessibility verification.
3. **4-Tier Test Plan Delivered**:
   - Comprehensive test specifications covering Tier 1 (Feature Coverage R1–R5), Tier 2 (Boundary & Corner Cases), Tier 3 (Cross-Feature Combinations), and Tier 4 (Real-World E2E Scenarios) are documented in `analysis.md`.
   - All 4 acceptance criteria from `ORIGINAL_REQUEST.md` have explicit programmatic test cases mapped to them.

---

## 5. Verification Method

To independently reproduce all observations and verify the test infrastructure:

1. **Execute Vitest Suite**:
   ```powershell
   npm test
   ```
   *Expected*: 44 test files pass, 464 tests pass in ~5s.

2. **Execute Single Test Files for Blueprint Studio & Studio Workspace**:
   ```powershell
   npx vitest run src/lib/blueprintStudio.test.ts
   npx vitest run src/lib/studioWorkspace.test.ts
   npx vitest run src/components/Toggle.test.ts
   ```
   *Expected*: Each individual suite passes in <500ms.

3. **Execute Benchmark & SQL Suites**:
   ```powershell
   npm run benchmark
   npm run test:sql
   ```
   *Expected*: All benchmarks and SQL suites exit with code 0.

4. **Verify Detailed Report**:
   Inspect `d:\Production\Projects\YouDO\.agents\teamwork\explorer_survey_2\analysis.md`.

5. **Invalidation Conditions**:
   - If `npm test` fails or throws missing module errors.
   - If `src/**/*.test.ts` files fail to be picked up by Vitest.
   - If `addBlueprintSteps` or `removeBlueprintSteps` fail to satisfy set-union / set-difference criteria.
