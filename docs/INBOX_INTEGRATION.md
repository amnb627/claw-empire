# Inbox Pipeline Integration

## Overview

The email pipeline (`daily_pipeline.py`) automatically pushes ACTION-classified emails to Claw Empire as tasks via `inbox_to_claw.py`.

This is **Step 5** of the daily pipeline — a non-critical step that runs after the hub is generated. If Claw Empire is offline or unreachable, the pipeline continues normally and prints a warning.

## Architecture

```
daily_pipeline.py (Step 5: step5_push_to_claw)
  → inbox_to_claw.py (dynamic import via importlib)
    → reads: 01_Input/03_Email/_Index/email_classification.json
    → maps: facility → project_id (via claw_facility_map.json)
    → dedup: checks existing inbox tasks (GET /api/tasks?status=inbox)
    → pushes: POST /api/tasks to Claw Empire
```

## Facility to Project Mapping

| Facility     | Claw Empire Project ID                 | Master Path     |
| ------------ | -------------------------------------- | --------------- |
| 三重大学     | `21ddd2a3-2d3d-4c18-b3dc-81b3a94db32a` | 1\_三重大学     |
| 東北大学     | `96d86744-30c8-4752-aafa-ba397853cbf9` | 2\_東北大学     |
| NCVC         | `8feb5946-8136-47d6-b1f6-a9f1293db3cb` | 3_NCVC          |
| 京都大学     | `0279b283-6eb2-4816-9951-2d373781c111` | 4\_京都大学     |
| 名古屋大学   | `9cc8d44d-5ed4-4b36-ab96-000fe99a055e` | 7\_名古屋大学   |
| 日本医科大学 | `ef3c552f-1323-4979-8478-562ec14219de` | 8\_日本医科大学 |
| 旭川医科大学 | `1494cdf3-f92d-461c-b909-6e22968f7e61` | 9\_旭川医科大学 |

The full mapping file (including aliases like `旭川` → `旭川医科大学`) is at:
`C:\MS\OneDrive - Siemens Healthineers\000_RC\00_Inbox\04_Output\03_Tools\claw_facility_map.json`

## Usage

```bash
# Normal run (includes Claw Empire push as Step 5)
python daily_pipeline.py

# Skip Claw Empire push (e.g., when server is offline)
python daily_pipeline.py --skip-claw

# Verbose output (shows dedup checks and task payloads)
python daily_pipeline.py --verbose

# Dry run preview (shows what would be pushed, no writes)
python inbox_to_claw.py --dry-run --verbose

# Manual push from existing classification
python inbox_to_claw.py --verbose
```

## Task Payload Structure

Each ACTION email is pushed as a Claw Empire task with:

| Field                | Value                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `title`              | `[施設名] メール件名` (up to 500 chars)                                                               |
| `status`             | `inbox`                                                                                               |
| `priority`           | `3` (high urgency) or `1` (others)                                                                    |
| `task_type`          | `analysis`                                                                                            |
| `workflow_pack_key`  | `report`                                                                                              |
| `project_id`         | Resolved from facility (if matched)                                                                   |
| `workflow_meta_json` | JSON with `source`, `dedup_key`, `facility`, `email_date`, `urgency`, `project`, `people`, `msg_file` |

## Deduplication

Tasks are deduplicated using an MD5 hash of `subject[:80] | sender | date[:10]`. On each run, existing inbox tasks are fetched and their `dedup_key` fields compared before creating new tasks. This prevents duplicate pushes across daily pipeline runs.

## Configuration

- **Facility map**: `04_Output/03_Tools/claw_facility_map.json`
- **Classification input**: `01_Input/03_Email/_Index/email_classification.json`
- **API base URL**: `http://localhost:8790`
- **Auth** (priority order):
  1. `CLAW_API_TOKEN` environment variable
  2. `API_AUTH_TOKEN` key in `C:\.agent\claw-empire\.env`
  3. Session cookie via `GET /api/auth/session` (loopback-privileged)

## Failure Handling

Step 5 is wrapped in a broad `try/except` block in `daily_pipeline.py`. The following failure modes are all handled gracefully (pipeline continues):

- Claw Empire server not running (connection refused)
- `inbox_to_claw.py` not found (ImportError)
- Auth failure (API rejects request)
- No ACTION emails in classification file

## Related Files

| File                                                 | Purpose                                            |
| ---------------------------------------------------- | -------------------------------------------------- |
| `04_Output/03_Tools/inbox_to_claw.py`                | Push script (standalone + importable)              |
| `04_Output/03_Tools/claw_facility_map.json`          | Facility → project_id mapping                      |
| `04_Output/03_Tools/daily_pipeline.py`               | Master pipeline orchestrator (Step 5 at line ~630) |
| `01_Input/03_Email/_Index/email_classification.json` | Classification results (input to Step 5)           |
