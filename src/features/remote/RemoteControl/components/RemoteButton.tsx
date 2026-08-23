import React from "react";
import { ButtonTone } from "../RemoteControl";

interface RemoteButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	tone?: ButtonTone;
}

export function RemoteButton({
	tone = "primary",
	className = "",
	type = "button",
	...props
}: RemoteButtonProps): React.JSX.Element {
	const tones: Record<ButtonTone, string> = {
		primary: "border border-blue-500 bg-blue-600 text-white hover:bg-blue-500",
		secondary: "border border-slate-500 bg-slate-700 text-slate-50 hover:bg-slate-600",
		danger: "border border-red-500 bg-red-600 text-white hover:bg-red-500",
		amber: "border border-amber-400 bg-amber-500 text-slate-950 hover:bg-amber-400",
	};
	return (
		<button type={type} className={`${tones[tone]} px-4 py-2 text-base font-bold ${className}`} {...props} />
	);
}
