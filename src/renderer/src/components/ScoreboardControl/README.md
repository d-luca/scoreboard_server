# Scoreboard Control Components

This directory contains two scoreboard control components for different use cases:

## ScoreboardControl
**Location:** `ScoreboardControl.tsx`

The standard scoreboard control component with full feedback displays. This component includes:
- Value boxes showing current scores, timer, and half values
- All control buttons with hotkey badges
- Timer loadout shortcuts
- Reset functionality
- Card-based layout with visible background

**Use Case:** Main application control panel where users need to see current values and have full control visibility.

---

## ScoreboardOverlayControl
**Location:** `ScoreboardOverlayControl.tsx`

A compact, transparent overlay control component optimized for overlay mode. This component features:

### Key Features
- **No Value Feedback:** Removes all value display boxes to save space and reduce visual clutter
- **Transparent Background:** Uses `bg-black/20` with `backdrop-blur-sm` for a subtle overlay effect
- **Compact Layout:** Optimized button placement in a 4-column grid
- **All Functionality Preserved:** Same controls as standard component, just more compact

### Layout Structure
```
┌─────────────────────────────────────────┐
│ [Home] [Away] [Timer] [Half]            │
│  +1     +1     ▶/⏸    +1                │
│  -1     -1     ⏹      -1                │
├─────────────────────────────────────────┤
│ [+1s] [-1s] [+1m] [-1m]                 │
├─────────────────────────────────────────┤
│ [L1] [L2] [L3]                          │
├─────────────────────────────────────────┤
│ [Reset]                                 │
└─────────────────────────────────────────┘
```

### Button Labels
- **L1, L2, L3:** Timer loadout shortcuts (shortened from "Loadout 1", etc.)
- **▶:** Start timer
- **⏸:** Pause timer
- **⏹:** Stop timer

### Usage Example
```tsx
import { ScoreboardOverlayControl } from '@renderer/components/ScoreboardControl/ScoreboardOverlayControl';

function OverlayControlPage() {
  return (
    <div className="p-4">
      <ScoreboardOverlayControl />
    </div>
  );
}
```

### Styling Notes
- Background: Semi-transparent black (`bg-black/20`) with backdrop blur
- All buttons use `size="sm"` for compact appearance
- Text labels use white with 70% opacity (`text-white/70`)
- Maintains all hotkey functionality from the standard component

**Use Case:** Overlay mode where screen real estate is limited and the scoreboard values are already visible on screen. Perfect for when you need compact controls that blend with the background.
