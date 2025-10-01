import React from "react";
import { Card } from "./ui/Card/Card";
import { CardHeader } from "./ui/Card/CardHeader";
import { CardTitle } from "./ui/Card/CardTitle";
import { CardDescription } from "./ui/Card/CardDescription";
import { CardContent } from "./ui/Card/CardContent";
import { Button } from "./ui/Button/Button";
import { CardFooter } from "./ui/Card/CardFooter";

/**
 * Demo component showcasing the new Button and Card components
 * with the dark theme styling
 */
export function UIComponentsDemo(): React.JSX.Element {
	return (
		<div className="bg-app-primary min-h-screen p-6">
			<div className="mx-auto max-w-4xl space-y-8">
				{/* Header */}
				<div className="text-center">
					<h1 className="text-app-primary mb-2 text-4xl font-bold">UI Components Demo</h1>
					<p className="text-app-secondary">Radix UI components with custom dark theme</p>
				</div>

				{/* Button Variants */}
				<Card>
					<CardHeader>
						<CardTitle>Button Components</CardTitle>
						<CardDescription>Various button styles and sizes using Radix UI</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						{/* Button Variants */}
						<div>
							<h4 className="text-app-primary mb-3 text-lg font-semibold">Variants</h4>
							<div className="flex flex-wrap gap-3">
								<Button variant="default">Default</Button>
								<Button variant="secondary">Secondary</Button>
								<Button variant="outline">Outline</Button>
								<Button variant="ghost">Ghost</Button>
								<Button variant="destructive">Destructive</Button>
								<Button variant="link">Link</Button>
							</div>
						</div>

						{/* Button Sizes */}
						<div>
							<h4 className="text-app-primary mb-3 text-lg font-semibold">Sizes</h4>
							<div className="flex flex-wrap items-center gap-3">
								<Button size="sm">Small</Button>
								<Button size="default">Default</Button>
								<Button size="lg">Large</Button>
								<Button size="icon">🎯</Button>
							</div>
						</div>

						{/* Disabled State */}
						<div>
							<h4 className="text-app-primary mb-3 text-lg font-semibold">States</h4>
							<div className="flex flex-wrap gap-3">
								<Button>Active</Button>
								<Button disabled>Disabled</Button>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Card Examples */}
				<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
					{/* Basic Card */}
					<Card>
						<CardHeader>
							<CardTitle>Team Statistics</CardTitle>
							<CardDescription>Current season performance</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								<div className="flex justify-between">
									<span className="text-app-secondary">Wins:</span>
									<span className="text-app-primary font-semibold">24</span>
								</div>
								<div className="flex justify-between">
									<span className="text-app-secondary">Losses:</span>
									<span className="text-app-primary font-semibold">8</span>
								</div>
								<div className="flex justify-between">
									<span className="text-app-secondary">Win Rate:</span>
									<span className="text-tertiary-500 font-semibold">75%</span>
								</div>
							</div>
						</CardContent>
						<CardFooter>
							<Button className="w-full">View Details</Button>
						</CardFooter>
					</Card>

					{/* Scoreboard Card */}
					<Card>
						<CardHeader>
							<CardTitle>Game Control</CardTitle>
							<CardDescription>Manage the current game</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="text-center">
								<div className="text-app-primary mb-1 text-3xl font-bold">98 - 102</div>
								<div className="text-app-secondary">Lakers vs Warriors</div>
								<div className="text-tertiary-500 mt-2 font-mono text-lg">12:45</div>
							</div>
						</CardContent>
						<CardFooter className="flex gap-2">
							<Button variant="outline" className="flex-1">
								Pause
							</Button>
							<Button variant="secondary" className="flex-1">
								Reset
							</Button>
						</CardFooter>
					</Card>

					{/* Settings Card */}
					<Card className="md:col-span-2">
						<CardHeader>
							<CardTitle>Quick Actions</CardTitle>
							<CardDescription>Common scoreboard operations</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
								<Button variant="outline" className="h-16 flex-col">
									<span className="mb-1 text-lg">⏱️</span>
									<span className="text-xs">Start Timer</span>
								</Button>
								<Button variant="outline" className="h-16 flex-col">
									<span className="mb-1 text-lg">⏸️</span>
									<span className="text-xs">Pause Game</span>
								</Button>
								<Button variant="outline" className="h-16 flex-col">
									<span className="mb-1 text-lg">🔄</span>
									<span className="text-xs">Reset Score</span>
								</Button>
								<Button variant="outline" className="h-16 flex-col">
									<span className="mb-1 text-lg">⚙️</span>
									<span className="text-xs">Settings</span>
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Status Cards */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<Card className="border-success-600">
						<CardContent className="p-4">
							<div className="flex items-center space-x-2">
								<div className="status-active">●</div>
								<div>
									<div className="text-app-primary font-semibold">Game Active</div>
									<div className="text-app-secondary text-sm">2nd Quarter in progress</div>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card className="border-warning-600">
						<CardContent className="p-4">
							<div className="flex items-center space-x-2">
								<div className="status-warning">●</div>
								<div>
									<div className="text-app-primary font-semibold">Timeout</div>
									<div className="text-app-secondary text-sm">Team timeout called</div>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card className="border-app-tertiary">
						<CardContent className="p-4">
							<div className="flex items-center space-x-2">
								<div className="status-inactive">●</div>
								<div>
									<div className="text-app-primary font-semibold">Halftime</div>
									<div className="text-app-secondary text-sm">15 minute break</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
