import { JSX, useState } from "react";
import { Card } from "../ui/Card/Card";
import { CardTitle } from "../ui/Card/CardTitle";
import { CardContent } from "../ui/Card/CardContent";
import { ScoreboardSettingsPanel } from "../ScoreboardSettings";
import { KeyboardShortcutsPanel } from "../HotkeySettings";
import { BuzzerSettingsPanel } from "./BuzzerSettingsPanel";

type SettingsTab = "scoreboard" | "shortcuts" | "buzzer";

const tabs: { id: SettingsTab; label: string }[] = [
	{ id: "scoreboard", label: "Scoreboard" },
	{ id: "shortcuts", label: "Keyboard Shortcuts" },
	{ id: "buzzer", label: "Buzzer" },
];

export function Settings(): JSX.Element {
	const [activeTab, setActiveTab] = useState<SettingsTab>("scoreboard");

	return (
		<Card className="border-app-primary flex min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden border">
			<CardTitle>Settings</CardTitle>
			<CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
				{/* Tab menu */}
				<div className="flex gap-2">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							className={`rounded-md px-3 py-1 text-sm font-semibold transition ${
								activeTab === tab.id
									? "bg-primary-500 text-white"
									: "bg-surface-secondary text-app-secondary hover:bg-surface-tertiary"
							}`}
							onClick={() => setActiveTab(tab.id)}
						>
							{tab.label}
						</button>
					))}
				</div>

				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					{activeTab === "scoreboard" && <ScoreboardSettingsPanel />}
					{activeTab === "shortcuts" && <KeyboardShortcutsPanel />}
					{activeTab === "buzzer" && <BuzzerSettingsPanel />}
				</div>
			</CardContent>
		</Card>
	);
}
