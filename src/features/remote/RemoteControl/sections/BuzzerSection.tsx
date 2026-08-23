import { WsTransport } from "@/lib/wsTransport";
import { SectionProps } from "./types";
import { useStore } from "zustand";
import React from "react";
import { PANEL_CLASS } from "./constants";
import { SectionHeading } from "../components/SectionHeading";
import { RemoteButton } from "../components/RemoteButton";
import { run } from "./utils";

export function BuzzerSection({
	store,
	transport,
	disabled,
}: SectionProps & { transport: WsTransport }): React.JSX.Element {
	const playBuzzer = useStore(store, (current) => current.playBuzzer);
	const [autoPlay, setAutoPlay] = React.useState(true);
	const audioRef = React.useRef<HTMLAudioElement>(null);
	const autoPlayRef = React.useRef(autoPlay);
	const armedRef = React.useRef(false);

	React.useEffect(() => {
		autoPlayRef.current = autoPlay;
	}, [autoPlay]);

	const playSound = React.useCallback((): void => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.muted = false;
		audio.currentTime = 0;
		void audio.play().catch(() => undefined);
	}, []);

	React.useEffect(() => {
		const stopTimerFinished = transport.onEvent("timer-finished", () => {
			if (autoPlayRef.current) playSound();
		});
		const stopBuzzer = transport.onEvent("buzzer", playSound);
		return () => {
			stopTimerFinished();
			stopBuzzer();
		};
	}, [playSound, transport]);

	React.useEffect(() => {
		const armAudio = (): void => {
			const audio = audioRef.current;
			if (!audio || armedRef.current) return;
			armedRef.current = true;
			audio.muted = true;
			audio.currentTime = 0;
			void audio
				.play()
				.then(() => {
					audio.pause();
					audio.currentTime = 0;
					audio.muted = false;
				})
				.catch(() => {
					armedRef.current = false;
					audio.muted = false;
				});
		};
		window.addEventListener("pointerdown", armAudio, { capture: true, once: true });
		return () => window.removeEventListener("pointerdown", armAudio, { capture: true });
	}, []);

	return (
		<section
			className={`${PANEL_CLASS} col-span-12 flex flex-wrap items-center gap-3`}
			aria-labelledby="buzzer-heading"
		>
			<audio ref={audioRef} src="/buzzer.mp3" preload="auto" />
			<div className="mr-auto">
				<SectionHeading id="buzzer-heading">Buzzer</SectionHeading>
				<p className="text-xs text-slate-400">Auto plays locally when the timer reaches zero.</p>
			</div>
			<RemoteButton tone="amber" disabled={disabled} onClick={() => run(playBuzzer())}>
				🔔 Buzzer
			</RemoteButton>
			<RemoteButton
				tone={autoPlay ? "primary" : "secondary"}
				aria-pressed={autoPlay}
				onClick={() => setAutoPlay((enabled) => !enabled)}
			>
				Auto: {autoPlay ? "ON" : "OFF"}
			</RemoteButton>
		</section>
	);
}
