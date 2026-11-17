export interface FrameTimestamps {
    frame(pts: number, dts: number): number;
    reset(): void;
}
export function createFrameTimestamps(): FrameTimestamps {
    let faultyPts = 0;
    let faultyDts = 0;
    let lastPts = Number.NEGATIVE_INFINITY;
    let lastDts = Number.NEGATIVE_INFINITY;
    return {
        frame(pts, dts) {
            const hasPts = pts >= 0;
            const hasDts = Number.isFinite(dts);
            if (hasDts) {
                if (dts <= lastDts)
                    faultyDts++;
                lastDts = dts;
            }
            if (hasPts) {
                if (pts <= lastPts)
                    faultyPts++;
                lastPts = pts;
            }
            if (hasPts && (faultyPts <= faultyDts || !hasDts))
                return pts;
            return hasDts ? dts : pts;
        },
        reset() {
            faultyPts = 0;
            faultyDts = 0;
            lastPts = Number.NEGATIVE_INFINITY;
            lastDts = Number.NEGATIVE_INFINITY;
        },
    };
}
export interface DecoderTimestamps {
    input(timestamp: number): void;
    output(timestamp: number): number;
    reset(): void;
}
export function createDecoderTimestamps(): DecoderTimestamps {
    const chunks: number[] = [];
    let faultyFrames = 0;
    let faultyChunks = 0;
    let lastFrame = Number.NEGATIVE_INFINITY;
    let lastChunk = Number.NEGATIVE_INFINITY;
    return {
        input(timestamp) {
            chunks.push(timestamp);
        },
        output(timestamp) {
            if (timestamp <= lastFrame)
                faultyFrames++;
            lastFrame = timestamp;
            const chunk = chunks.shift();
            if (chunk === undefined)
                return timestamp;
            if (chunk <= lastChunk)
                faultyChunks++;
            lastChunk = chunk;
            return faultyFrames <= faultyChunks ? timestamp : chunk;
        },
        reset() {
            chunks.length = 0;
            faultyFrames = 0;
            faultyChunks = 0;
            lastFrame = Number.NEGATIVE_INFINITY;
            lastChunk = Number.NEGATIVE_INFINITY;
        },
    };
}
