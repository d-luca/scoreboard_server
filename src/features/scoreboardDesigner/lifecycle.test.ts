import { describe, expect, it, vi } from "vitest";
import { connectDesignerLifecycle, type DesignerLifecycleApi } from "./lifecycle";

function api(): DesignerLifecycleApi {
	return {
		listenRequest: vi.fn(async () => vi.fn()),
		listenError: vi.fn(async () => vi.fn()),
		ready: vi.fn(async () => undefined),
		promptOpened: vi.fn(async () => undefined),
		resolve: vi.fn(async () => undefined),
	};
}

describe("native designer readiness", () => {
	it("registers both listeners before ready and never automatically authorizes shutdown", async () => {
		const backend = api();
		const order: string[] = [];
		const stopRequest = vi.fn();
		const stopError = vi.fn();
		vi.mocked(backend.listenRequest).mockImplementation(async (receive) => {
			order.push("request");
			receive({ requestId: "id", reason: "close-main" });
			return stopRequest;
		});
		vi.mocked(backend.listenError).mockImplementation(async () => {
			order.push("error");
			return stopError;
		});
		vi.mocked(backend.ready).mockImplementation(async () => {
			order.push("ready");
		});
		const receive = vi.fn();
		const stop = await connectDesignerLifecycle(backend, receive, vi.fn());
		expect(order).toEqual(["request", "error", "ready"]);
		expect(receive).toHaveBeenCalledWith({ requestId: "id", reason: "close-main" });
		expect(backend.resolve).not.toHaveBeenCalled();
		stop();
		expect(stopRequest).toHaveBeenCalledOnce();
		expect(stopError).toHaveBeenCalledOnce();
	});

	it("surfaces a handshake failure and releases every registered listener", async () => {
		const backend = api();
		const stop = vi.fn();
		vi.mocked(backend.listenRequest).mockResolvedValueOnce(stop);
		vi.mocked(backend.ready).mockRejectedValueOnce(new Error("Not ready"));
		await expect(connectDesignerLifecycle(backend, vi.fn(), vi.fn())).rejects.toThrow("Not ready");
		expect(stop).toHaveBeenCalledOnce();
	});
});
