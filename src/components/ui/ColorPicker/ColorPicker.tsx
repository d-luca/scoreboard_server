import { useState, JSX } from "react";
import { cn } from "../../../lib/utils";

interface ColorPickerProps {
	value?: string;
	onChange?: (color: string) => void;
	presetColors?: string[];
	className?: string;
}

const defaultPresetColors = [
	"#ffffff", // White
	"#000000", // Black
	"#ffcc00", // Gold/Yellow
	"#0066cc", // Blue
	"#00cc00", // Green
];

export function ColorPicker({
	value = "#000000",
	onChange,
	presetColors = defaultPresetColors,
	className,
}: ColorPickerProps): JSX.Element {
	const [selectedColor, setSelectedColor] = useState(value);

	const handleColorChange = (color: string): void => {
		setSelectedColor(color);
		onChange?.(color);
	};

	return (
		<div className={cn("space-y-3", className)}>
			{/* Preset Colors */}
			<div className="flex flex-wrap gap-2">
				{presetColors.map((color) => (
					<button
						key={color}
						type="button"
						className={cn(
							"h-10 w-10 rounded-lg ring-2 transition-all hover:scale-105 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none",
							selectedColor === color
								? "shadow-lg ring-2 ring-blue-500 ring-offset-1"
								: "shadow-sm hover:border-gray-500",
						)}
						style={{ backgroundColor: color }}
						onClick={() => handleColorChange(color)}
						title={`Select ${color}`}
						aria-label={`Color ${color}`}
					/>
				))}
			</div>

			{/* Custom Color Picker */}
			<div className="flex items-center gap-2">
				<input
					type="color"
					value={selectedColor}
					onChange={(e) => handleColorChange(e.target.value)}
					className="h-8 w-16 cursor-pointer rounded border border-gray-300"
				/>
				<span className="text-app-quaternary text-xs">Custom color</span>
			</div>
		</div>
	);
}
