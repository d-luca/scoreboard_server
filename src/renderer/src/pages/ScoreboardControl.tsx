import { Button } from "@renderer/components/ui/Button/Button";
import { Card } from "@renderer/components/ui/Card/Card";
import { CardContent } from "@renderer/components/ui/Card/CardContent";
import { CardDescription } from "@renderer/components/ui/Card/CardDescription";
import { CardHeader } from "@renderer/components/ui/Card/CardHeader";
import { CardTitle } from "@renderer/components/ui/Card/CardTitle";
import React, { useState } from "react";

interface Team {
	name: string;
	score: number;
	color: string;
}

interface GameState {
	homeTeam: Team;
	awayTeam: Team;
	time: string;
	quarter: number;
	isActive: boolean;
}

/**
 * Enhanced Scoreboard Control Panel using the new UI components
 */
export function ScoreboardControl(): React.JSX.Element {
	const [gameState, setGameState] = useState<GameState>({
		homeTeam: { name: "Lakers", score: 98, color: "#552583" },
		awayTeam: { name: "Warriors", score: 102, color: "#006BB6" },
		time: "12:45",
		quarter: 2,
		isActive: true,
	});

	const updateScore = (team: "home" | "away", points: number): void => {
		setGameState((prev) => ({
			...prev,
			[team === "home" ? "homeTeam" : "awayTeam"]: {
				...prev[team === "home" ? "homeTeam" : "awayTeam"],
				score: Math.max(0, prev[team === "home" ? "homeTeam" : "awayTeam"].score + points),
			},
		}));
	};

	const toggleGame = (): void => {
		setGameState((prev) => ({ ...prev, isActive: !prev.isActive }));
	};

	const resetGame = (): void => {
		setGameState((prev) => ({
			...prev,
			homeTeam: { ...prev.homeTeam, score: 0 },
			awayTeam: { ...prev.awayTeam, score: 0 },
			time: "12:00",
			quarter: 1,
			isActive: false,
		}));
	};

	return (
		<div className="bg-app-primary min-h-screen p-6">
			<div className="mx-auto max-w-6xl space-y-6">
				{/* Header */}
				<div className="text-center">
					<h1 className="text-app-primary mb-2 text-4xl font-bold">Scoreboard Control</h1>
					<p className="text-app-secondary">Game management with Radix UI components</p>
				</div>

				{/* Main Scoreboard Display */}
				<Card className="border-primary-700">
					<CardContent className="p-8">
						<div className="grid grid-cols-3 items-center gap-8">
							{/* Away Team */}
							<div className="text-center">
								<div
									className="mx-auto mb-2 h-4 w-4 rounded-full"
									style={{ backgroundColor: gameState.awayTeam.color }}
								/>
								<div className="team-name mb-2">{gameState.awayTeam.name}</div>
								<div className="team-score">{gameState.awayTeam.score}</div>
							</div>

							{/* Game Info */}
							<div className="text-center">
								<div className="game-timer mb-2">{gameState.time}</div>
								<div className="text-app-secondary mb-2">Quarter {gameState.quarter}</div>
								<div className={gameState.isActive ? "status-active" : "status-inactive"}>
									{gameState.isActive ? "LIVE" : "PAUSED"}
								</div>
							</div>

							{/* Home Team */}
							<div className="text-center">
								<div
									className="mx-auto mb-2 h-4 w-4 rounded-full"
									style={{ backgroundColor: gameState.homeTeam.color }}
								/>
								<div className="team-name mb-2">{gameState.homeTeam.name}</div>
								<div className="team-score">{gameState.homeTeam.score}</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Control Panels */}
				<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
					{/* Away Team Controls */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<div className="h-3 w-3 rounded-full" style={{ backgroundColor: gameState.awayTeam.color }} />
								{gameState.awayTeam.name} Controls
							</CardTitle>
							<CardDescription>Manage away team score</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="text-center">
								<div className="text-app-primary mb-4 text-2xl font-bold">{gameState.awayTeam.score}</div>
								<div className="grid grid-cols-2 gap-2">
									<Button variant="outline" onClick={() => updateScore("away", 1)}>
										+1
									</Button>
									<Button variant="outline" onClick={() => updateScore("away", 2)}>
										+2
									</Button>
									<Button variant="outline" onClick={() => updateScore("away", 3)}>
										+3
									</Button>
									<Button variant="destructive" onClick={() => updateScore("away", -1)}>
										-1
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Home Team Controls */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<div className="h-3 w-3 rounded-full" style={{ backgroundColor: gameState.homeTeam.color }} />
								{gameState.homeTeam.name} Controls
							</CardTitle>
							<CardDescription>Manage home team score</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="text-center">
								<div className="text-app-primary mb-4 text-2xl font-bold">{gameState.homeTeam.score}</div>
								<div className="grid grid-cols-2 gap-2">
									<Button variant="outline" onClick={() => updateScore("home", 1)}>
										+1
									</Button>
									<Button variant="outline" onClick={() => updateScore("home", 2)}>
										+2
									</Button>
									<Button variant="outline" onClick={() => updateScore("home", 3)}>
										+3
									</Button>
									<Button variant="destructive" onClick={() => updateScore("home", -1)}>
										-1
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Game Controls */}
				<Card>
					<CardHeader>
						<CardTitle>Game Controls</CardTitle>
						<CardDescription>Manage game state and timing</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
							<Button
								variant={gameState.isActive ? "secondary" : "default"}
								onClick={toggleGame}
								className="h-16 flex-col"
							>
								<span className="mb-1 text-xl">{gameState.isActive ? "⏸️" : "▶️"}</span>
								<span className="text-sm">{gameState.isActive ? "Pause" : "Start"}</span>
							</Button>

							<Button variant="outline" onClick={resetGame} className="h-16 flex-col">
								<span className="mb-1 text-xl">🔄</span>
								<span className="text-sm">Reset</span>
							</Button>

							<Button
								variant="ghost"
								className="h-16 flex-col"
								onClick={() =>
									setGameState((prev) => ({
										...prev,
										quarter: Math.min(4, prev.quarter + 1),
									}))
								}
							>
								<span className="mb-1 text-xl">⏭️</span>
								<span className="text-sm">Next Quarter</span>
							</Button>

							<Button variant="ghost" className="h-16 flex-col">
								<span className="mb-1 text-xl">⚙️</span>
								<span className="text-sm">Settings</span>
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Quick Stats */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<Card className="border-tertiary-600">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<div className="text-app-secondary text-sm">Total Points</div>
									<div className="text-app-primary text-2xl font-bold">
										{gameState.homeTeam.score + gameState.awayTeam.score}
									</div>
								</div>
								<div className="text-2xl">🏀</div>
							</div>
						</CardContent>
					</Card>

					<Card className="border-secondary-600">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<div className="text-app-secondary text-sm">Lead</div>
									<div className="text-app-primary text-2xl font-bold">
										{Math.abs(gameState.homeTeam.score - gameState.awayTeam.score)}
									</div>
								</div>
								<div className="text-2xl">📊</div>
							</div>
						</CardContent>
					</Card>

					<Card className="border-primary-600">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<div className="text-app-secondary text-sm">Quarter</div>
									<div className="text-app-primary text-2xl font-bold">{gameState.quarter}/4</div>
								</div>
								<div className="text-2xl">⏱️</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
