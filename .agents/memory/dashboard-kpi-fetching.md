---
name: Dashboard KPI fetching
description: Reliability rule for slow external KPI queries in the calls dashboard.
---

External KPI requests must be gated by the prerequisites for the selected view (connection status and operator/team context) and must not refetch implicitly on focus or reconnect. Refreshes should be explicit.

**Why:** Mango requests can take tens of seconds when its session has expired; automatic retries and focus/refetch cycles make the dashboard appear to refresh forever and multiply expensive requests.

**How to apply:** When adding or changing dashboard queries, set an explicit `enabled` condition, disable automatic focus/reconnect retries, and keep personal and team KPI requests mutually exclusive.