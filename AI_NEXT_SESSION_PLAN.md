# AI Next Session Plan: Addressing Debugging Issues and Implementing Remaining Logic

This document outlines the plan and work list for the next AI session, focusing on resolving the issues identified during the previous debugging session and implementing the remaining core extension logic.

## 1. Session Objective

The primary objective of this session is to diagnose and fix the identified issues related to icon status display and data serialization, and to implement the logic for the exclamation icon based on user clarification.

## 2. Unresolved Issues from Previous Session

Based on the debugging efforts, the following issues need to be addressed:

*   **Trusted Images Status:** Images expected to show a green trust indicator are currently showing an error status due to expired certificates in the test files. This requires re-evaluation of UAT expectations or test data.
*   **Untrusted Images Icon:** Warning icons for untrusted images are disappearing unexpectedly after being set. The cause of this removal is still unknown, as logging attempts were inconclusive (potentially due to tool limitations or environment discrepancies).
*   **Broken Ingredient Thumbnails:** Thumbnail images for ingredients in the C2PA metadata overlay pop-up are not displaying due to incorrect data serialization in [`src/c2pa.ts`](src/c2pa.ts).
*   **Missing C2PA Data Icon:** Logic is needed to display an exclamation icon for images that *should* have C2PA data but don't. The criteria for identifying such images are pending user clarification.

## 3. Plan for Next AI Session

The plan for the next AI session is as follows, prioritizing the identified issues:

1.  **Fix Broken Ingredient Thumbnails:** Modify the `serializeC2paReadResult` function in [`src/c2pa.ts`](src/c2pa.ts) to correctly convert ingredient thumbnail blobs to data URLs.
2.  **Investigate and Fix Untrusted Images Icon:**
    *   If tool limitations are resolved, re-run UAT tests with existing logging to gather more data on icon removal.
    *   Analyze console output to pinpoint the source of the unexpected icon removal.
    *   Modify [`src/inject.ts`](src/inject.ts) to prevent the warning icon from being removed for untrusted images.
3.  **Implement Missing C2PA Data Icon:**
    *   Based on user clarification on how to identify images that *should* have C2PA data, implement the necessary logic in [`src/inject.ts`](src/inject.ts) and potentially [`src/c2pa.ts`](src/c2pa.ts) or other relevant files.
    *   Add a new status ('exclamation') and update `getC2PAStatus` and `CrIcon` as needed.
4.  **Re-evaluate Trusted Images Status:**
    *   Discuss with the user the discrepancy between UAT expectations and the C2PA validation results for trusted images with expired certificates.
    *   Determine if the test files should be updated or if the UAT criteria need adjustment.
    *   If necessary, explore potential (but risky) modifications to `getC2PAStatus` to accommodate UAT expectations, with clear documentation of the deviation from standard C2PA validation.

## 4. Work List for Next AI Session

Based on the plan, the work list for the next session includes:

*   Modify [`src/c2pa.ts`](src/c2pa.ts) to fix ingredient thumbnail serialization.
*   Analyze console output (to be provided by the user) for clues on icon removal.
*   Modify [`src/inject.ts`](src/inject.ts) to ensure warning icons persist for untrusted images.
*   Implement logic for identifying images that *should* have C2PA data (pending user input).
*   Add 'exclamation' status and update icon handling in [`src/inject.ts`](src/inject.ts) and [`src/icon.ts`](src/icon.ts).
*   Coordinate with the user regarding trusted image test cases and UAT expectations.

## 5. Information Needed for Next Session

To effectively proceed in the next session, the following information is required from the user:

*   **Full console output** from running the UAT tests with the latest code changes (including the logging added in the previous session).
*   **Clarification on the criteria** for identifying images that *should* have C2PA data but do not, to implement the exclamation icon.

This plan and work list will guide our efforts in the next AI session. Please review them, and be prepared to provide the requested information.