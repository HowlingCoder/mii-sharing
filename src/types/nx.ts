// nx.js exposes `screen` as a canvas surface.
// The built-in TS Screen type lacks getContext, so we define our own.
export type NxScreen = {
    getContext(id: '2d'): CanvasRenderingContext2D;
    width: number;
    height: number;
};

// Switch.readFile returns ArrayBufferLike; most nx.js write APIs want ArrayBuffer.
// Use this alias and helper wherever Uint8Array<ArrayBuffer> is required.
export type NxBytes = Uint8Array<ArrayBuffer>;

export function toNxBytes(buf: ArrayBufferLike): NxBytes;
export function toNxBytes(buf: Uint8Array): NxBytes;
export function toNxBytes(buf: ArrayBufferLike | Uint8Array): NxBytes {
    if (buf instanceof Uint8Array) {
        return new Uint8Array(buf.buffer as ArrayBuffer, buf.byteOffset, buf.byteLength);
    }
    return new Uint8Array(buf as ArrayBuffer);
}
