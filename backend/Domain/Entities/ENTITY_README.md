# Domain Entities Documentation

This document describes the core **Domain Entities** implemented in the backend.
The project uses an **ODM-style persistence model** (JSON documents + local file storage),
not a relational SQL database.

Large artifacts (CSV files, cleaned datasets, PDFs, plots) are stored on disk.
Entities store only **metadata and file paths**.

---

## User Entity (`User.cs`)

**Purpose**
- Represents an authenticated user of the system
- Handles identity, authentication state, and dashboard pointers

**Key Responsibilities**
- Stores login-related data (username, email, password hash)
- Tracks account state (active / deactivated)
- Stores references to the **latest dataset, job, and report** for fast dashboard loading

**Important Notes**
- The User entity does **not** store CSVs, cleaned data, plots, or PDFs
- It only stores references (`Guid`) to the latest related entities
- PasswordHash is never exposed outside the backend

**Why Latest Pointers Exist**
The dashboard operates in a *latest-only* mode.  
When a user logs in, the dashboard loads the most recent dataset and report
using these pointers without scanning all stored data.

---

## Dataset Entity (`Dataset.cs`)

**Purpose**
- Represents a single dataset upload by a user

**Key Responsibilities**
- Owns both the **original CSV** and the **cleaned CSV**
- Stores file paths for downloadable artifacts
- Stores a small preview for dashboard display

**Stored Data**
- Original CSV file path
- Cleaned CSV file path (optional)
- Preview JSON (columns + first few rows)
- Basic metadata (file name, size, row/column count)

**Important Notes**
- Original and cleaned datasets are both preserved
- Cleaning does **not** create a new Dataset
- Cleaning only updates the `CleanedCsvPath` field
- Preview data is generated once and reused to avoid re-reading large CSV files

---

## Project Entity (`Project.cs`) – Reserved Feature

**Purpose**
- Represents a logical workspace for grouping datasets and reports

**Current Status**
- **Not used in the current application flow**
- The dashboard operates in a single, latest-only mode
- No UI or API endpoints currently reference Project

**Why It Exists**
The Project entity is included to support **future expansion**, such as:
- Multiple datasets per project
- Historical report browsing
- User-managed workspaces

**Design Decision**
The entity is retained but intentionally unused to avoid unnecessary complexity
while keeping the domain model extensible.

---

## Design Summary

- Entities are **plain C# objects (POCOs)**
- Persistence is handled via JSON serialization (ODM-style)
- Large files are stored on disk, not in entity objects
- Python services perform data processing
- C# backend owns state, persistence, and API contracts

This separation ensures a clean architecture and allows the system to scale
in features without redesigning the core domain.
