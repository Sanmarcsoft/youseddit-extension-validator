# Agile Product Management Plan: C2PA Image Verification Extension

This document outlines the agile product management strategy for the C2PA Image Verification Extension project, detailing how the Product Manager (Roo) will orchestrate and "play the role" of each development team member to ensure efficient progress through the MVP phase.

## 1. Overall Agile Process

The project will follow an iterative agile approach, focusing on short development cycles (sprints) to deliver incremental value. The core loop will involve:
1.  **Sprint Planning:** Reviewing the Kanban board and prioritizing tasks.
2.  **Execution (Role-Playing):** Stepping into each team member's role to execute their assigned tasks.
3.  **Daily Stand-ups (Internal Check-ins):** Brief self-assessments of progress, blockers, and next steps.
4.  **Review & Retrospective:** Evaluating completed work and identifying areas for improvement.

## 2. Role-Specific Execution Strategy (Product Manager as Orchestrator)

As the Product Manager, I will sequentially address the tasks for each role, leveraging the `AI_START_HERE` documents created for each.

### 2.1. Product Manager (Roo) - Orchestration and Oversight

*   **Focus:** Overall project health, communication, and alignment with `PRODUCT_ROADMAP.md` and `PRODUCT_REQUIREMENTS_DOCUMENT.md`.
*   **Key Activities:**
    *   Review `KANBAN_BOARD.md` to understand current task status and priorities.
    *   Facilitate communication by ensuring all "role-played" tasks are aligned and dependencies are managed.
    *   Monitor progress and identify potential roadblocks.
    *   Ensure the development environment is set up for all roles by initiating `pnpm install` as needed.

### 2.2. Frontend Developer (Devin) - Prototyping UI

*   **Focus:** Icon injection and basic viewer page layout.
*   **Key Activities (as Devin):**
    *   Ensure `pnpm install` has been run for environment setup.
    *   Examine `public/iframe.html`, `public/popup.html`, `public/options.html`, and associated CSS files (`public/iframe.css`, `public/popup.css`, `public/options.css`).
    *   Prototype icon injection mechanisms (likely in `src/content.ts` or `src/overlay.ts`).
    *   Develop basic HTML/CSS for the viewer page layout.
    *   Collaborate with UI/UX (Casey) on design elements.

### 2.3. Extension Logic Developer (Alex) - C2PA Integration

*   **Focus:** Integrating `c2pa-js` and implementing image interception/parsing.
*   **Key Activities (as Alex):**
    *   Ensure `pnpm install` has been run for environment setup.
    *   Deep dive into `src/background.ts`, `src/content.ts`, `src/c2pa.ts`, and `src/mediaMonitor.ts`.
    *   Implement logic to detect images larger than 50x50 pixels.
    *   Integrate `c2pa-js` for metadata detection and parsing.
    *   Develop mechanisms for passing C2PA data to the frontend.

### 2.4. UI/UX Designer (Casey) - Design Wireframes

*   **Focus:** Designing the icon and viewer page wireframes.
*   **Key Activities (as Casey):**
    *   Ensure `pnpm install` has been run for environment setup.
    *   Review `PRODUCT_REQUIREMENTS_DOCUMENT.md` for UI/UX specifications.
    *   Create wireframes and mockups for the visual indicator icon.
    *   Design the layout and user flow for the detailed C2PA viewer page.
    *   Provide design assets and guidelines to the Frontend Developer (Devin).
    *   Examine `public/icons/` for existing icon assets.

### 2.5. QA Engineer (Jamie) - Test Planning

*   **Focus:** Developing initial test plans and beginning manual testing.
*   **Key Activities (as Jamie):**
    *   Ensure `pnpm install` has been run for environment setup.
    *   Review `PRODUCT_REQUIREMENTS_DOCUMENT.md` to understand functional requirements.
    *   Develop a comprehensive test plan, including test cases for image detection, C2PA metadata parsing, icon display, and viewer page functionality.
    *   Utilize `test/` directory for existing test files and media to inform test case creation.
    *   Begin manual testing as features become available.

## 3. Navigation and Iteration

I will navigate between these roles as follows:
*   **Initial Setup:** Begin by ensuring the "Development Environment Setup" is complete for all roles (running `pnpm install`).
*   **Prioritization:** Refer to `KANBAN_BOARD.md` to determine the highest priority task.
*   **Role Activation:** "Activate" the relevant role (e.g., if the highest priority is icon injection, I will act as Devin).
*   **Task Execution:** Execute the specific task for that role using the appropriate tools (e.g., `read_file`, `apply_diff`, `write_to_file`, `execute_command`).
*   **Cross-Role Collaboration:** When a task requires input or output from another role, I will simulate that interaction by switching roles or noting the dependency for future "role-playing."
*   **Continuous Integration:** After completing a significant task within a role, I will consider running `pnpm run build` to check for integration issues, assuming dependencies are met.
*   **Feedback Loop:** Regularly review the overall project status and adjust the plan based on progress and any new information.

This structured approach will allow me to systematically address the project's requirements from each team member's perspective, ensuring a cohesive and efficient development process.