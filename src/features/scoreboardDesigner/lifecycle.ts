import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DesignerCloseDecision } from "../../bindings/DesignerCloseDecision";
import type { DesignerCloseError } from "../../bindings/DesignerCloseError";
import type { DesignerCloseRequest } from "../../bindings/DesignerCloseRequest";

export interface DesignerLifecycleApi {
	listenRequest(callback: (request: DesignerCloseRequest) => void): Promise<UnlistenFn>;
	listenError(callback: (error: DesignerCloseError) => void): Promise<UnlistenFn>;
	ready(): Promise<void>;
	promptOpened(requestId: string): Promise<void>;
	resolve(requestId: string, decision: DesignerCloseDecision): Promise<void>;
}

export const designerLifecycle: DesignerLifecycleApi = {
	listenRequest: (callback) =>
		listen<DesignerCloseRequest>("designer:close-requested", ({ payload }) => callback(payload)),
	listenError: (callback) =>
		listen<DesignerCloseError>("designer:close-error", ({ payload }) => callback(payload)),
	ready: () => invoke("designer_ready"),
	promptOpened: (requestId) => invoke("designer_close_prompt_opened", { requestId }),
	resolve: (requestId, decision) => invoke("designer_resolve_close", { requestId, decision }),
};

export async function connectDesignerLifecycle(
	api: DesignerLifecycleApi,
	request: (request: DesignerCloseRequest) => void,
	error: (error: DesignerCloseError) => void,
): Promise<UnlistenFn> {
	const stops: UnlistenFn[] = [];
	try {
		stops.push(await api.listenRequest(request));
		stops.push(await api.listenError(error));
		await api.ready();
		return () => stops.forEach((stop) => stop());
	} catch (failure) {
		stops.forEach((stop) => stop());
		throw failure;
	}
}
