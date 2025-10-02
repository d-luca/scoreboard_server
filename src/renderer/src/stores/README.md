# Scoreboard Store

This folder contains Zustand stores for managing application state.

## useScoreboardStore

A Zustand store that manages the scoreboard state according to the `ScoreboardProps` interface.

### Usage

#### Basic usage with the main store:

```tsx
import { useScoreboardStore } from '@renderer/stores/scoreboardStore';

function ScoreboardComponent() {
  const store = useScoreboardStore();

  // Access state
  console.log(store.teamHomeName);
  console.log(store.teamHomeScore);

  // Update state
  const handleUpdateScore = () => {
    store.setTeamHomeScore(store.teamHomeScore! + 1);
  };

  return (
    <div>
      <h1>{store.teamHomeName} vs {store.teamAwayName}</h1>
      <p>Score: {store.teamHomeScore} - {store.teamAwayScore}</p>
      <button onClick={handleUpdateScore}>+1 Home</button>
    </div>
  );
}
```

#### Using the convenience hooks:

```tsx
import { useScoreboardData, useScoreboardActions } from '@renderer/stores/scoreboardStore';

function ScoreboardComponent() {
  const data = useScoreboardData();
  const actions = useScoreboardActions();

  const handleUpdateScore = () => {
    actions.setTeamHomeScore((data.teamHomeScore || 0) + 1);
  };

  const handleReset = () => {
    actions.reset();
  };

  const handleBulkUpdate = () => {
    actions.updateScoreboardData({
      teamHomeName: "Lakers",
      teamAwayName: "Warriors",
      teamHomeScore: 98,
      teamAwayScore: 102
    });
  };

  return (
    <div>
      <h1>{data.teamHomeName} vs {data.teamAwayName}</h1>
      <p>Score: {data.teamHomeScore} - {data.teamAwayScore}</p>
      <button onClick={handleUpdateScore}>+1 Home</button>
      <button onClick={handleReset}>Reset</button>
      <button onClick={handleBulkUpdate}>Load Demo Data</button>
    </div>
  );
}
```

### Available Actions

- `setEventLogo(logo?: string)` - Set the event logo
- `setTeamHomeScore(score: number)` - Set home team score
- `setTeamAwayScore(score: number)` - Set away team score
- `setTimer(timer: number)` - Set game timer
- `setHalf(half: number)` - Set current half/quarter
- `setTeamHomeName(name?: string)` - Set home team name
- `setTeamAwayName(name?: string)` - Set away team name
- `setTeamHomeColor(color?: string)` - Set home team color
- `setTeamAwayColor(color?: string)` - Set away team color
- `updateScoreboardData(data: Partial<ScoreboardProps>)` - Bulk update multiple fields
- `reset()` - Reset to default values

### Default Values

```typescript
{
  eventLogo: undefined,
  teamHomeName: "T-H",
  teamAwayName: "T-A",
  teamHomeColor: "#00ff00",
  teamAwayColor: "#ff0000",
  teamHomeScore: 0,
  teamAwayScore: 0,
  timer: 0,
  half: 1,
}
```
