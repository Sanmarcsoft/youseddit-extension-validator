# Sanmarcsoft Team Roles and Initial Tasks

## 1. Product Manager (Roo - That's me!)
**Role:** Drives the product vision, defines requirements, manages the roadmap, coordinates the team, and ensures successful product delivery.
**Key Responsibilities:**
*   Maintain and update the Product Roadmap and PRD.
*   Facilitate team meetings and communication.
*   Prioritize features and tasks.
*   Manage stakeholder expectations.
*   Monitor project progress and address blockers.
*   Ensure alignment with strategic goals.

**Initial Tasks:**
*   Finalize Product Roadmap and PRD (Completed).
*   Define initial team roles and responsibilities.
*   Create initial task lists for each role player.
*   Set up a Kanban board for task tracking.
*   Schedule and lead the first project kickoff meeting.
*   Oversee the initial setup of development environment and tools.

## 2. Frontend Developer (Devin)
**Role:** Responsible for implementing the user interface and user experience components of the extension, including the C2PA indicator icon and the metadata viewer page.
**Key Responsibilities:**
*   Develop and maintain the content script for injecting UI elements.
*   Implement the C2PA indicator icon and its interaction.
*   Build the local metadata viewer page (HTML, CSS, JavaScript).
*   Ensure UI responsiveness and cross-browser compatibility (within Chrome).
*   Collaborate with UI/UX Designer for visual consistency.

**Initial Tasks:**
*   Familiarize with Chrome Extension API for content scripts and UI injection.
*   Set up the development environment for frontend work.
*   Prototype the C2PA indicator icon injection mechanism.
*   Begin designing the basic layout for `public/iframe.html` (metadata viewer).
*   Integrate placeholder for C2PA metadata display on the viewer page.

## 3. Extension Logic Developer (Alex)
**Role:** Responsible for the core logic of the extension, including background script operations, image interception, C2PA metadata parsing, and data handling.
**Key Responsibilities:**
*   Develop and maintain the background script for network request monitoring.
*   Implement image dimension checking and filtering.
*   Integrate and utilize the `c2pa-js` library for metadata extraction.
*   Handle communication between background script and content script.
*   Manage data storage and retrieval within the extension.

**Initial Tasks:**
*   Familiarize with Chrome Extension API for background scripts and network requests.
*   Set up the development environment for backend/logic work.
*   Research and integrate the `c2pa-js` library into the extension.
*   Develop a module for intercepting image loads and checking dimensions.
*   Implement initial C2PA metadata parsing logic.

## 4. QA Engineer (Jamie)
**Role:** Ensures the quality and reliability of the extension through comprehensive testing, bug identification, and verification of requirements.
**Key Responsibilities:**
*   Develop test plans and test cases based on the PRD.
*   Perform functional, performance, and usability testing.
*   Identify, document, and track bugs.
*   Verify bug fixes and new feature implementations.
*   Provide feedback on user experience and potential improvements.

**Initial Tasks:**
*   Familiarize with the Product Roadmap and PRD.
*   Set up a testing environment for Chrome extensions.
*   Develop a preliminary test plan for MVP features (image scanning, icon display, viewer page).
*   Begin manual testing of basic image loading and interaction.
*   Research automated testing frameworks for Chrome extensions.

## 5. UI/UX Designer (Casey)
**Role:** Responsible for the overall user experience and visual design of the extension, ensuring it is intuitive, aesthetically pleasing, and consistent.
**Key Responsibilities:**
*   Design the C2PA indicator icon (visuals, states).
*   Design the layout and visual elements of the metadata viewer page.
*   Create wireframes and mockups for key user flows.
*   Ensure accessibility standards are met.
*   Provide design specifications and assets to the Frontend Developer.

**Initial Tasks:**
*   Review the Product Roadmap and PRD, focusing on user experience aspects.
*   Research existing Chrome extension UI patterns and best practices.
*   Brainstorm and sketch initial concepts for the C2PA indicator icon.
*   Create wireframes for the metadata viewer page (`public/iframe.html`).
*   Define a basic color palette and typography for the extension UI.