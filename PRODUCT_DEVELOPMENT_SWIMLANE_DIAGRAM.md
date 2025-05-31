# Product Development Process: Swimlane Diagram

This document provides a visual representation of the agile product development process for the C2PA Image Verification Extension, using a swimlane diagram to illustrate the flow of tasks across different team roles.

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD
    subgraph Product Manager (Roo)
        PM_A[Review Kanban Board & Prioritize] --> PM_B(Ensure Dev Environment Setup)
        PM_B --> PM_C{Facilitate Communication & Monitor Progress}
    end

    subgraph Frontend Developer (Devin)
        FD_A[Prototype Icon Injection] --> FD_B(Develop Viewer Page Layout)
        FD_B --> FD_C{Collaborate with UI/UX}
    end

    subgraph Extension Logic Developer (Alex)
        ELD_A[Integrate c2pa-js] --> ELD_B(Implement Image Interception/Parsing)
        ELD_B --> ELD_C{Develop Data Passing Mechanisms}
    end

    subgraph UI/UX Designer (Casey)
        UX_A[Design Icon Wireframes] --> UX_B(Design Viewer Page Wireframes)
        UX_B --> UX_C{Provide Design Assets & Guidelines}
    end

    subgraph QA Engineer (Jamie)
        QA_A[Develop Initial Test Plans] --> QA_B(Begin Manual Testing)
    end

    PM_A --> FD_A
    PM_A --> ELD_A
    PM_A --> UX_A
    PM_A --> QA_A

    FD_C --> PM_C
    ELD_C --> PM_C
    UX_C --> PM_C
    QA_B --> PM_C

    PM_C --> PM_A