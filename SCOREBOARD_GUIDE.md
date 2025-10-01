# Scoreboard Server for OBS Studio

This Electron application provides a scoreboard interface that can be used with OBS Studio for streaming sports matches. It creates a localhost web server that serves a real-time scoreboard view optimized for video streaming.

## Features

- **Real-time Updates**: WebSocket-based real-time scoreboard updates
- **OBS Integration**: Serves a clean scoreboard view at `http://localhost:3001/scoreboard`
- **Team Management**: Customize team names, colors, and scores
- **Timer Control**: Manage game timer with minute/second precision
- **Half/Period Tracking**: Track game periods or halves
- **Responsive Design**: Optimized for streaming with transparent background support

## Architecture

The application consists of three main components:

1. **Electron Main Process**: Manages the HTTP server and WebSocket connections
2. **Renderer Process**: React-based control interface for managing scoreboard data
3. **Web Server**: Express.js server that serves the scoreboard view to OBS Studio

## Setup and Usage

### 1. Installation

```bash
pnpm install
```

### 2. Development

**Standard Development** (uses built scoreboard component):
```bash
pnpm run dev
```

**Development with Auto-Rebuilding Scoreboard** (automatically rebuilds scoreboard when renderer components change):
```bash
pnpm run dev:with-scoreboard
```

**Manual Scoreboard Build** (when you make changes to scoreboard components):
```bash
pnpm run build:scoreboard
```

### 3. Building

```bash
pnpm run build
```

### 4. Scoreboard Component Workflow

The application now uses a smart system where the server-side rendered scoreboard is built from your actual renderer components:

1. **Make changes** to scoreboard components in `src/renderer/src/components/Scoreboard/`
2. **Build the scoreboard component**: `pnpm run build:scoreboard`
3. **Restart the server** or use `pnpm run dev:with-scoreboard` for automatic rebuilding
4. **The OBS view automatically updates** to match your React components

No more manual SSR component maintenance!

### 4. OBS Studio Integration

1. Start the application (development or built version)
2. In OBS Studio, add a new **Browser Source**
3. Set the URL to: `http://localhost:3001/scoreboard`
4. Set Width: `480px`, Height: `48px`
5. Enable "Shutdown source when not visible" and "Refresh browser when scene becomes active"

## API Endpoints

The server exposes several HTTP endpoints:

- `GET /scoreboard` - Main scoreboard view for OBS
- `GET /api/scoreboard` - JSON API to get current scoreboard data
- `POST /api/scoreboard` - JSON API to update scoreboard data
- `GET /health` - Health check endpoint

## WebSocket Updates

The scoreboard view connects to the WebSocket server for real-time updates. When you make changes in the Electron app, they are immediately reflected in the OBS browser source.

## Scoreboard Data Structure

```typescript
interface ScoreboardData {
    teamHomeName: string;      // Home team name
    teamAwayName: string;      // Away team name
    teamHomeScore: number;     // Home team score
    teamAwayScore: number;     // Away team score
    teamHomeColor: string;     // Home team color (hex)
    teamAwayColor: string;     // Away team color (hex)
    timer: number;             // Timer in seconds
    half: number;              // Current half/period
    eventLogo?: string;        // Optional event logo URL
}
```

## Controls

### Team Controls
- **Score**: Use +1/-1 buttons to adjust scores
- **Team Name**: Click "Set Name" to edit team names
- **Team Color**: Use color picker to set team colors

### Timer Controls
- **Set Time**: Click "Set Time" to directly input time (MM:SS format)
- **Adjust Time**: Use +1s/-1s and +1m/-1m buttons for fine adjustments

### Half Controls
- **Half/Period**: Use +1/-1 buttons to change the current half or period

## Troubleshooting

### Port Already in Use
If port 3001 is already in use, the server will fail to start. You can modify the port in `src/main/index.ts`:

```typescript
scoreboardServer = new ScoreboardServer(3002); // Change to different port
```

### CORS Issues
The server is configured with permissive CORS headers to allow OBS Browser Source access. If you encounter issues, check that your OBS version supports the configured CORS settings.

### WebSocket Connection Issues
If real-time updates aren't working:
1. Check browser console for WebSocket errors
2. Verify the server is running on the correct port
3. Try refreshing the browser source in OBS

## Customization

### Styling
The scoreboard appearance can be customized by modifying the CSS in `src/main/server.ts` in the `generateScoreboardHTML()` method.

### Additional Fields
To add more data fields (e.g., timeouts, fouls), update:
1. `ScoreboardData` interface in `src/types/scoreboard.ts`
2. HTML template in `src/main/server.ts`
3. Control components in `src/renderer/src/components/ScoreboardControl/`

### Different Sports
The system is designed to be adaptable for different sports by modifying the data structure and controls as needed.

## Technical Details

- **Framework**: Electron + React + TypeScript
- **Server**: Express.js with WebSocket support
- **Build Tool**: Vite via electron-vite
- **Styling**: Tailwind CSS
- **Real-time Communication**: WebSockets (ws library)

## File Structure

```
src/
├── main/                  # Electron main process
│   ├── index.ts          # Main application entry
│   └── server.ts         # HTTP/WebSocket server
├── preload/              # Electron preload scripts
│   ├── index.ts
│   └── index.d.ts
├── renderer/             # React frontend
│   └── src/
│       ├── components/   # React components
│       ├── hooks/        # Custom React hooks
│       └── pages/        # Page components
└── types/                # Shared TypeScript types
    └── scoreboard.ts
```

This setup provides a complete solution for integrating a dynamic scoreboard into your OBS Studio streaming setup.
