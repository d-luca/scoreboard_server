// Entry point for building the Scoreboard component for SSR usage
import "./scoreboard.css";
import { Scoreboard } from "./components/Scoreboard";

// Re-export necessary types
export type { TeamsData } from "./types/teamsForm";
export type { ScoreboardProps } from "./components/Scoreboard";

// Export the component for SSR usage
export { Scoreboard };
export default Scoreboard;
