export function run(command: Promise<void>): void {
	void command.catch(() => undefined);
}
