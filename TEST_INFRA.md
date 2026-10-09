# E2E Test Infra: YouDO Blueprint Studio Rebuild

## Test Philosophy
- Opaque-box, requirement-driven testing. Derived from user requirements in `ORIGINAL_REQUEST.md`, not implementation design.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial Testing + Real-World Workloads.
- Execution Environment: Vitest 4.1.11 under Node.js (`npm test`).

## Feature Inventory & Test Coverage Goals
| # | Feature | Source | Tier 1 (Coverage) | Tier 2 (Boundaries) | Tier 3 (Pairwise) | Tier 4 (Real-World) |
|---|---------|--------|:-----------------:|:-------------------:|:-----------------:|:-------------------:|
| 1 | R1. Flexible Node Expansion (Choice: Steps vs Children) | ORIGINAL_REQUEST §R1 | ≥5 | ≥5 | ✓ | ✓ |
| 2 | R2. Bulk "Add Inside" Multi-Parent Targeting | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ | ✓ |
| 3 | R3. Bulk Step Diffing (Set-Union Add, Set-Diff Remove) | ORIGINAL_REQUEST §R3 | ≥5 | ≥5 | ✓ | ✓ |
| 4 | R4. Individual & Bulk Date Setting (ISO YYYY-MM-DD) | ORIGINAL_REQUEST §R4 | ≥5 | ≥5 | ✓ | ✓ |
| 5 | R5. Simple, Soothing UI/UX & Transactional Draft | ORIGINAL_REQUEST §R5 | ≥5 | ≥5 | ✓ | ✓ |

## Test Architecture
- **Test Runner**: Vitest 4.1.11 via `npm test` or `npx vitest run src/lib/blueprintStudioE2E.test.ts`.
- **Pass/Fail Semantics**: All tests must exit with code 0, 0 unhandled rejections, 0 assertion failures.
- **Test Locations**:
  - `src/lib/blueprintStudio.test.ts` — Unit tests for pure tree transforms.
  - `src/lib/blueprintStudioE2E.test.ts` — Comprehensive 4-tier requirement test suite.
  - `src/components/studio/blueprintStudioState.test.ts` — State machine and multi-selection tests.
  - `src/components/BlueprintStudio.test.ts` — Static markup and accessibility tests.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Academic Course Syllabus Builder | R1, R2, R4 | High |
| 2 | Multi-Module Software Release Breakdown | R1, R2, R3, R4 | High |
| 3 | Sprint Grooming & Step Standardization | R2, R3 | Medium |
| 4 | Daily Habit & Milestone Date Shifting | R4, R5 | Medium |
| 5 | Complex Nested Goal Tree Reorganization | R1, R2, R3, R5 | High |

## Coverage Thresholds
- Tier 1: ≥5 per feature (≥25 tests total)
- Tier 2: ≥5 per feature (≥25 tests total)
- Tier 3: Pairwise combinations of all features (≥10 tests)
- Tier 4: ≥5 realistic end-to-end application scenarios
- **Total Minimum Test Cases**: ≥65 test cases across the Blueprint Studio test suites.
