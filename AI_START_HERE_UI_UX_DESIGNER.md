# AI START HERE: UI/UX Designer (Casey) - C2PA Image Verification Extension Project Status

This document provides a quick overview of the C2PA Image Verification Extension project, its current status, key documents, and immediate next steps, specifically tailored for the UI/UX Designer role.

## 1. Project Overview

The C2PA Image Verification Extension is a Chrome web extension aimed at enhancing trust and transparency in digital media. It will scan webpages for images larger than 50x50 pixels, detect embedded C2PA metadata, and provide a visual indicator. Clicking this indicator will open a local viewer page displaying detailed C2PA provenance information and the original full-size image.

## 2. Current Project State

The initial planning and documentation phase for the MVP (Minimum Viable Product) is complete. Key foundational documents have been created to guide development. The team roles, initial tasks, and a Kanban board for tracking progress have been established.

## 3. Key Project Documents

The following core documents have been generated and are available in the root directory:

*   [`PRODUCT_ROADMAP.md`](PRODUCT_ROADMAP.md): Outlines the strategic vision, goals, and phased development plan for the extension from MVP to future enhancements.
*   [`PRODUCT_REQUIREMENTS_DOCUMENT.md`](PRODUCT_REQUIREMENTS_DOCUMENT.md): Details the functional and non-functional requirements, user stories, and technical considerations for the extension.
*   [`SANMARCSOFT_TEAM_AND_TASKS.md`](SANMARCSOFT_TEAM_AND_TASKS.md): Defines the roles and initial responsibilities for each development team member (Product Manager, Frontend Developer, Extension Logic Developer, QA Engineer, UI/UX Designer) and their respective initial tasks.
*   [`MEETING_SCRIPT_SITCOM.md`](MEETING_SCRIPT_SITCOM.md): A "sitcom script" encapsulating the key discussion points and team dynamics from the initial project kickoff meeting.
*   [`KANBAN_BOARD.md`](KANBAN_BOARD.md): A Kanban board tracking the initial tasks for the MVP phase, categorized into "To Do," "In Progress," and "Done."

## 4. File and Folder Status

The repository contains the foundational structure for a Chrome extension, including:
*   `src/`: Contains the TypeScript source code for the extension's background scripts, content scripts, C2PA integration, and UI logic. This is where the core development will occur.
*   `public/`: Contains static assets like HTML pages (`iframe.html`, `popup.html`, `options.html`) and CSS files for the extension's UI, as well as icons.
*   `test/`: Contains various test files and media for C2PA validation and extension testing.
*   `patches/`: Contains a patch for the `c2pa` library.

The project is set up with `package.json` for dependency management (likely `npm` or `pnpm`), `tsconfig.json` for TypeScript configuration, and `rollup.config.js` for bundling.

## 5. Next Steps / Current Focus for UI/UX Designer (Casey)

Based on the `KANBAN_BOARD.md`, the team is now in the "To Do" phase for the MVP. Your immediate focus as UI/UX Designer (Casey) is on:

*   **Development Environment Setup:** Set up your development environment by running `pnpm install` to ensure all dependencies are installed.
*   **Design & Planning:** Designing the icon and viewer page wireframes. This will involve creating visual mockups and potentially working with the `public/icons/` directory for icon assets and `public/` HTML/CSS files for viewer page layout.