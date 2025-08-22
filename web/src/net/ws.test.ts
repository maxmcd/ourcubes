import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplyHandler, PresenceHandler } from "./ws.js";
import { connect } from "./ws.js";

// Mock WebSocket
class MockWebSocket {
    url: string;
    readyState: number = WebSocket.CONNECTING;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url: string) {
        this.url = url;

        // Simulate connection opening
        setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            if (this.onopen) {
                this.onopen(new Event("open"));
            }
        }, 10);
    }

    send(_data: string) {
        // Mock send - we could add assertions here if needed
    }

    close() {
        this.readyState = MockWebSocket.CLOSED;
        if (this.onclose) {
            this.onclose(new CloseEvent("close"));
        }
    }

    // Helper to simulate receiving messages
    simulateMessage(data: string) {
        if (this.onmessage) {
            this.onmessage(new MessageEvent("message", { data }));
        }
    }
}

// Mock localStorage
const mockLocalStorage = {
    store: {} as Record<string, string>,
    getItem: vi.fn((key: string) => mockLocalStorage.store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
        mockLocalStorage.store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
        delete mockLocalStorage.store[key];
    }),
    clear: vi.fn(() => {
        mockLocalStorage.store = {};
    }),
};

describe("WebSocket Connection", () => {
    beforeEach(() => {
        // Mock global objects
        global.WebSocket = MockWebSocket as typeof WebSocket;
        // Ensure WebSocket constants are available globally
        // biome-ignore lint/suspicious/noExplicitAny: Required for test mocking
        (global.WebSocket as any).OPEN = MockWebSocket.OPEN;
        // biome-ignore lint/suspicious/noExplicitAny: Required for test mocking
        (global.WebSocket as any).CLOSED = MockWebSocket.CLOSED;
        // biome-ignore lint/suspicious/noExplicitAny: Required for test mocking
        (global.WebSocket as any).CONNECTING = MockWebSocket.CONNECTING;
        // biome-ignore lint/suspicious/noExplicitAny: Required for test mocking
        (global.WebSocket as any).CLOSING = MockWebSocket.CLOSING;
        global.localStorage = mockLocalStorage as Storage;

        // Mock location object
        global.location = {
            hostname: "localhost",
            host: "localhost:3000",
            protocol: "http:",
        } as Location;

        // Clear localStorage mock
        mockLocalStorage.store = {};
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should construct WebSocket with correct URL", () => {
        const mockOnApply: ApplyHandler = vi.fn();
        const mockOnWelcome = vi.fn();

        // Mock the WebSocket constructor
        const mockWebSocketConstructor = vi
            .fn()
            .mockImplementation((url) => new MockWebSocket(url));
        global.WebSocket = mockWebSocketConstructor;

        connect("test-room", mockOnApply, mockOnWelcome);

        // Should construct WebSocket with development URL
        expect(mockWebSocketConstructor).toHaveBeenCalledWith(
            "ws://localhost:8787/api/room/test-room/ws"
        );
    });

    it("should send hello message on connection open", async () => {
        const mockOnApply: ApplyHandler = vi.fn();
        const mockOnWelcome = vi.fn();

        // Set up a stored player ID
        mockLocalStorage.store.playerId = "existing-player-123";

        const mockWs = new MockWebSocket("ws://test");
        const sendSpy = vi.spyOn(mockWs, "send");

        // Mock the WebSocket constructor to return our mock
        global.WebSocket = vi.fn().mockImplementation(() => mockWs);

        connect("test-room", mockOnApply, mockOnWelcome);

        // Trigger the onopen event
        if (mockWs.onopen) {
            mockWs.onopen(new Event("open"));
        }

        expect(sendSpy).toHaveBeenCalledWith(
            expect.stringMatching(
                /"type":"hello".*"playerId":"existing-player-123".*"clientClock":\d+/
            )
        );
    });

    it("should handle welcome message", async () => {
        const mockOnApply: ApplyHandler = vi.fn();
        const mockOnWelcome = vi.fn();

        const mockWs = new MockWebSocket("ws://test");
        global.WebSocket = vi.fn().mockImplementation(() => mockWs);

        connect("test-room", mockOnApply, mockOnWelcome);

        const welcomeMsg = {
            type: "welcome",
            playerId: "new-player-456",
            state: [[0, "#FF0000"]],
            version: 1,
        };

        // Simulate receiving welcome message
        mockWs.simulateMessage(JSON.stringify(welcomeMsg));

        expect(mockOnWelcome).toHaveBeenCalledWith(welcomeMsg);
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith("playerId", "new-player-456");
    });

    it("should handle apply message", async () => {
        const mockOnApply: ApplyHandler = vi.fn();
        const mockOnWelcome = vi.fn();

        const mockWs = new MockWebSocket("ws://test");
        global.WebSocket = vi.fn().mockImplementation(() => mockWs);

        connect("test-room", mockOnApply, mockOnWelcome);

        const applyMsg = {
            type: "apply",
            ops: [
                {
                    type: "set",
                    k: 100,
                    color: "#00FF00",
                    t: 123456789,
                },
            ],
            version: 2,
        };

        // Simulate receiving apply message
        mockWs.simulateMessage(JSON.stringify(applyMsg));

        expect(mockOnApply).toHaveBeenCalledWith(applyMsg.ops, applyMsg.version);
    });

    it("should handle presence message", async () => {
        const mockOnApply: ApplyHandler = vi.fn();
        const mockOnWelcome = vi.fn();
        const mockOnPresence: PresenceHandler = vi.fn();

        const mockWs = new MockWebSocket("ws://test");
        global.WebSocket = vi.fn().mockImplementation(() => mockWs);

        connect("test-room", mockOnApply, mockOnWelcome, mockOnPresence);

        const presenceMsg = {
            type: "presence",
            players: [
                {
                    playerId: "player-123",
                    cursor: [10, 5, 15],
                },
            ],
        };

        // Simulate receiving presence message
        mockWs.simulateMessage(JSON.stringify(presenceMsg));

        expect(mockOnPresence).toHaveBeenCalledWith(presenceMsg.players);
    });

    it("should return functions for sending operations and presence", () => {
        const mockOnApply: ApplyHandler = vi.fn();
        const mockOnWelcome = vi.fn();

        const mockWs = new MockWebSocket("ws://test");
        const sendSpy = vi.spyOn(mockWs, "send");
        global.WebSocket = vi.fn().mockImplementation(() => mockWs);
        // Add constants after overriding WebSocket constructor
        // biome-ignore lint/suspicious/noExplicitAny: Required for test mocking
        (global.WebSocket as any).OPEN = MockWebSocket.OPEN;
        // biome-ignore lint/suspicious/noExplicitAny: Required for test mocking
        (global.WebSocket as any).CLOSED = MockWebSocket.CLOSED;
        // biome-ignore lint/suspicious/noExplicitAny: Required for test mocking
        (global.WebSocket as any).CONNECTING = MockWebSocket.CONNECTING;
        // biome-ignore lint/suspicious/noExplicitAny: Required for test mocking
        (global.WebSocket as any).CLOSING = MockWebSocket.CLOSING;

        const { setOps, sendPresence } = connect("test-room", mockOnApply, mockOnWelcome);

        expect(typeof setOps).toBe("function");
        expect(typeof sendPresence).toBe("function");

        // Test setOps
        const testOps = [
            {
                type: "set" as const,
                k: 100,
                color: "#FF0000" as const,
                t: Date.now(),
            },
        ];

        setOps(testOps);
        expect(sendSpy).toHaveBeenCalledWith(JSON.stringify({ type: "set", ops: testOps }));

        // Clear previous calls and test sendPresence
        sendSpy.mockClear();
        mockWs.readyState = MockWebSocket.OPEN;
        sendPresence([5, 10, 15]);
        expect(sendSpy).toHaveBeenCalledWith(
            JSON.stringify({ type: "presence", cursor: [5, 10, 15] })
        );
    });

    it("should use production host in production", () => {
        // Mock production environment
        global.location = {
            hostname: "example.com",
            host: "example.com",
            protocol: "https:",
        } as Location;

        const mockOnApply: ApplyHandler = vi.fn();
        const mockOnWelcome = vi.fn();

        // Mock the WebSocket constructor
        const mockWebSocketConstructor = vi
            .fn()
            .mockImplementation((url) => new MockWebSocket(url));
        global.WebSocket = mockWebSocketConstructor;

        connect("test-room", mockOnApply, mockOnWelcome);

        expect(mockWebSocketConstructor).toHaveBeenCalledWith(
            "wss://example.com/api/room/test-room/ws"
        );
    });

    it("should not send presence when WebSocket is not open", () => {
        const mockOnApply: ApplyHandler = vi.fn();
        const mockOnWelcome = vi.fn();

        const mockWs = new MockWebSocket("ws://test");
        const sendSpy = vi.spyOn(mockWs, "send");
        mockWs.readyState = MockWebSocket.CONNECTING; // Not open
        global.WebSocket = vi.fn().mockImplementation(() => mockWs);

        const { sendPresence } = connect("test-room", mockOnApply, mockOnWelcome);

        sendPresence([5, 10, 15]);

        // Should not call send when WebSocket is not open
        expect(sendSpy).not.toHaveBeenCalledWith(
            JSON.stringify({ type: "presence", cursor: [5, 10, 15] })
        );
    });
});
