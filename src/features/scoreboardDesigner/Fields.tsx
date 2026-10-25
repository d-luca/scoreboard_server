import { useContext, useEffect, useId, useState, type JSX } from "react";
import { Input } from "../../components/ui/Input/Input";
import { PendingEditsContext, parseNumber, type PendingEdits } from "./pendingEdits";

/** Pending text is local, but registered so Save and navigation cannot overlook an uncommitted edit. */
export function CommitField({
	id,
	label,
	value,
	onCommit,
	edits,
	multiline = false,
	numeric = false,
	disabled = false,
}: {
	id: string;
	label: string;
	value: string;
	onCommit(value: string): void;
	edits: PendingEdits;
	multiline?: boolean;
	numeric?: boolean;
	disabled?: boolean;
}): JSX.Element {
	const [base, setBase] = useState(value);
	const [text, setText] = useState(value);
	const [error, setError] = useState<string | null>(null);
	if (base !== value) {
		setBase(value);
		setText(value);
		setError(null);
	}
	useEffect(() => () => edits.stage(id, null), [edits, id]);
	const commit = (raw: string): void => {
		try {
			onCommit(raw);
			edits.stage(id, null);
			setError(null);
		} catch (error) {
			setError(error instanceof Error ? error.message : String(error));
			throw error;
		}
	};
	const props = {
		id,
		value: text,
		disabled,
		"aria-labelledby": `${id}-label`,
		"aria-invalid": Boolean(error),
		"aria-describedby": error ? `${id}-error` : undefined,
		onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
			const next = event.target.value;
			setText(next);
			setError(null);
			edits.stage(id, next === value ? null : () => commit(next));
		},
		onBlur: (): void => {
			if (text !== value) {
				try {
					commit(text);
				} catch {
					/* The field retains and displays the rejected input. */
				}
			}
		},
		onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				setText(value);
				setError(null);
				edits.stage(id, null);
			}
			if (event.key === "Enter" && (!multiline || event.ctrlKey)) {
				event.preventDefault();
				event.currentTarget.blur();
			}
		},
	};
	return (
		<label className="designer-field" htmlFor={id}>
			<span id={`${id}-label`}>{label}</span>
			{multiline ? (
				<textarea {...props} rows={4} />
			) : (
				<Input {...props} inputMode={numeric ? "decimal" : undefined} />
			)}
			{error && (
				<small id={`${id}-error`} role="alert">
					{error}
				</small>
			)}
		</label>
	);
}

export function NumberField({
	value,
	min,
	max,
	integer,
	onCommit,
	...props
}: Omit<Parameters<typeof CommitField>[0], "value" | "onCommit" | "numeric"> & {
	value: number;
	min: number;
	max: number;
	integer?: boolean;
	onCommit(value: number): void;
}): JSX.Element {
	return (
		<CommitField
			{...props}
			numeric
			value={String(value)}
			onCommit={(raw) => onCommit(parseNumber(raw, min, max, integer))}
		/>
	);
}

export function Choice<T extends string>({
	label,
	value,
	choices,
	onChange,
	disabled,
}: {
	label: string;
	value: T;
	choices: readonly T[];
	onChange(value: T): void;
	disabled?: boolean;
}): JSX.Element {
	const edits = useContext(PendingEditsContext);
	const [error, setError] = useState<string | null>(null);
	const errorId = useId();
	return (
		<label className="designer-field">
			<span>{label}</span>
			<select
				aria-label={label}
				aria-invalid={Boolean(error)}
				aria-describedby={error ? errorId : undefined}
				value={value}
				disabled={disabled}
				onChange={(event) => {
					const choice = choices.find((item) => item === event.target.value);
					if (choice === undefined) return;
					try {
						edits?.flush();
						onChange(choice);
						setError(null);
					} catch (error) {
						setError(error instanceof Error ? error.message : String(error));
					}
				}}
			>
				{choices.map((choice) => (
					<option key={choice} value={choice}>
						{choice}
					</option>
				))}
			</select>
			{error && (
				<small id={errorId} role="alert">
					{error}
				</small>
			)}
		</label>
	);
}
