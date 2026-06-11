# TODO - Town auto-list + unified Supabase backend access

## Step 1: UI (AgentPropertyDistribution.jsx)
- Create a unified Supabase access approach in this UI: read towns + properties from Supabase only (one Supabase “source of truth”).
- Prefer deriving agent allowed towns from `agent_property_access` -> `all_sales` (town_name) so CEO-added towns show automatically once access records exist.
- Fall back to reading the agent’s `agent_towns` from Supabase users table if mapping isn’t available.
- Remove dependence on incoming `agent.agent_towns` prop as the primary driver.


## Step 2: Enable/refresh logic
- When towns list loads, auto-select first town and load its properties.
- Add a manual refresh button if needed (optional).

## Step 3: Backend mapping (CEO -> agent towns)
- Inspect CEO “Add Town” flow.
- Ensure new towns are written into the agent-visible mapping so UI can discover them automatically.

## Step 4: Verification
- Test: CEO adds town → open Agent Property Distribution → new town appears.
- Test: properties for that town list correctly.
- Test: existing towns remain listed.

