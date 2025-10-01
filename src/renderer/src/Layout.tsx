import { PropsWithChildren } from "react";

export function Layout({ children }: PropsWithChildren): React.JSX.Element {
	return <div className="flex h-screen w-screen flex-col overflow-hidden p-4">{children}</div>;
}
