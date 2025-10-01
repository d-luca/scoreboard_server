import React from "react";

/**
 * Example component demonstrating the dark theme CSS variables and custom classes
 * This shows how to use the colors and styles we've defined in global.css
 */
export function ThemeExample(): React.JSX.Element {
	return (
		<div className="bg-app-primary min-h-screen p-6">
			{/* Main Container */}
			<div className="mx-auto max-w-4xl space-y-6">
				{/* Header */}
				<header className="mb-8 text-center">
					<h1 className="text-app-primary mb-2 text-4xl font-bold">Scoreboard App Theme</h1>
					<p className="text-app-secondary">Dark blue theme with custom CSS variables</p>
				</header>

				{/* Color Palette */}
				<div className="grid grid-cols-1 gap-6 md:grid-cols-3">
					{/* Primary Colors */}
					<div className="card p-6">
						<h3 className="text-app-primary mb-4 text-xl font-semibold">Primary Colors</h3>
						<div className="grid grid-cols-3 gap-2">
							<div className="bg-primary-300 flex h-12 items-center justify-center rounded text-xs text-gray-900">
								300
							</div>
							<div className="bg-primary-500 flex h-12 items-center justify-center rounded text-xs text-white">
								500
							</div>
							<div className="bg-primary-700 flex h-12 items-center justify-center rounded text-xs text-white">
								700
							</div>
							<div className="bg-primary-400 flex h-12 items-center justify-center rounded text-xs text-gray-900">
								400
							</div>
							<div className="bg-primary-600 flex h-12 items-center justify-center rounded text-xs text-white">
								600
							</div>
							<div className="bg-primary-800 flex h-12 items-center justify-center rounded text-xs text-white">
								800
							</div>
						</div>
					</div>

					{/* Secondary Colors */}
					<div className="card p-6">
						<h3 className="text-app-primary mb-4 text-xl font-semibold">Secondary Colors</h3>
						<div className="grid grid-cols-3 gap-2">
							<div className="bg-secondary-300 flex h-12 items-center justify-center rounded text-xs text-gray-900">
								300
							</div>
							<div className="bg-secondary-500 flex h-12 items-center justify-center rounded text-xs text-white">
								500
							</div>
							<div className="bg-secondary-700 flex h-12 items-center justify-center rounded text-xs text-white">
								700
							</div>
							<div className="bg-secondary-400 flex h-12 items-center justify-center rounded text-xs text-gray-900">
								400
							</div>
							<div className="bg-secondary-600 flex h-12 items-center justify-center rounded text-xs text-white">
								600
							</div>
							<div className="bg-secondary-800 flex h-12 items-center justify-center rounded text-xs text-white">
								800
							</div>
						</div>
					</div>

					{/* Tertiary Colors */}
					<div className="card p-6">
						<h3 className="text-app-primary mb-4 text-xl font-semibold">Tertiary Colors</h3>
						<div className="grid grid-cols-3 gap-2">
							<div className="bg-tertiary-300 flex h-12 items-center justify-center rounded text-xs text-gray-900">
								300
							</div>
							<div className="bg-tertiary-500 flex h-12 items-center justify-center rounded text-xs text-white">
								500
							</div>
							<div className="bg-tertiary-700 flex h-12 items-center justify-center rounded text-xs text-white">
								700
							</div>
							<div className="bg-tertiary-400 flex h-12 items-center justify-center rounded text-xs text-gray-900">
								400
							</div>
							<div className="bg-tertiary-600 flex h-12 items-center justify-center rounded text-xs text-white">
								600
							</div>
							<div className="bg-tertiary-800 flex h-12 items-center justify-center rounded text-xs text-white">
								800
							</div>
						</div>
					</div>
				</div>

				{/* Buttons */}
				<div className="card-elevated p-6">
					<h3 className="text-app-primary mb-4 text-xl font-semibold">Button Components</h3>
					<div className="flex flex-wrap gap-4">
						<button className="btn-primary">Primary Button</button>
						<button className="btn-secondary">Secondary Button</button>
						<button className="btn-tertiary">Tertiary Button</button>
						<button className="btn-outline">Outline Button</button>
						<button className="btn-ghost">Ghost Button</button>
					</div>
				</div>

				{/* Status Indicators */}
				<div className="card p-6">
					<h3 className="text-app-primary mb-4 text-xl font-semibold">Status Indicators</h3>
					<div className="flex flex-wrap gap-4">
						<span className="status-active">Active</span>
						<span className="status-warning">Warning</span>
						<span className="status-error">Error</span>
						<span className="status-inactive">Inactive</span>
					</div>
				</div>

				{/* Scoreboard Demo */}
				<div className="scoreboard-panel">
					<h3 className="text-app-primary mb-6 text-xl font-semibold">Scoreboard Panel Example</h3>
					<div className="grid grid-cols-1 items-center gap-6 md:grid-cols-3">
						{/* Team A */}
						<div className="text-center">
							<div className="team-name mb-2">Lakers</div>
							<div className="team-score">98</div>
						</div>

						{/* Timer */}
						<div className="text-center">
							<div className="game-timer">12:45</div>
							<div className="text-app-tertiary mt-2 text-sm">2nd Quarter</div>
						</div>

						{/* Team B */}
						<div className="text-center">
							<div className="team-name mb-2">Warriors</div>
							<div className="team-score">102</div>
						</div>
					</div>
				</div>

				{/* Background Variations */}
				<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
					<div className="bg-app-primary border-app-primary rounded-lg border p-4">
						<h4 className="text-app-primary font-semibold">Primary BG</h4>
						<p className="text-app-secondary text-sm">Main background</p>
					</div>
					<div className="bg-app-secondary border-app-secondary rounded-lg border p-4">
						<h4 className="text-app-primary font-semibold">Secondary BG</h4>
						<p className="text-app-secondary text-sm">Cards, panels</p>
					</div>
					<div className="bg-app-tertiary border-app-tertiary rounded-lg border p-4">
						<h4 className="text-app-primary font-semibold">Tertiary BG</h4>
						<p className="text-app-secondary text-sm">Elevated elements</p>
					</div>
					<div className="bg-app-quaternary rounded-lg p-4">
						<h4 className="text-app-primary font-semibold">Quaternary BG</h4>
						<p className="text-app-secondary text-sm">Hover states</p>
					</div>
				</div>

				{/* Text Examples */}
				<div className="card p-6">
					<h3 className="text-app-primary mb-4 text-xl font-semibold">Text Variations</h3>
					<div className="space-y-2">
						<p className="text-app-primary">Primary text - main content</p>
						<p className="text-app-secondary">Secondary text - descriptions</p>
						<p className="text-app-tertiary">Tertiary text - muted content</p>
						<p className="text-app-quaternary">Quaternary text - placeholders</p>
						<p className="text-app-disabled">Disabled text - inactive elements</p>
					</div>
				</div>
			</div>
		</div>
	);
}
