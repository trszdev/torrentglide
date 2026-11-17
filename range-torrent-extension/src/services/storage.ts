export interface StorageChange {
    oldValue?: unknown;
    newValue?: unknown;
}
export type StorageChanges = Record<string, StorageChange>;
export interface StorageArea {
    get(keys: string[] | null): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
    remove(keys: string[]): Promise<void>;
    watch(listener: (changes: StorageChanges) => void): () => void;
}
export interface BrowserStorage {
    local: Pick<StorageArea, 'get' | 'set' | 'remove'>;
    session?: Pick<StorageArea, 'get' | 'set' | 'remove'>;
    onChanged: {
        addListener(listener: (changes: StorageChanges, areaName: string) => void): void;
        removeListener(listener: (changes: StorageChanges, areaName: string) => void): void;
    };
}
export function browserArea(storage: BrowserStorage, name: 'local' | 'session'): StorageArea {
    const area = storage[name];
    if (!area)
        throw new Error(`storage.${name} is not available`);
    return {
        get: (keys) => area.get(keys),
        set: (items) => area.set(items),
        remove: (keys) => area.remove(keys),
        watch(listener) {
            const onChanged = (changes: StorageChanges, areaName: string) => {
                if (areaName === name)
                    listener(changes);
            };
            storage.onChanged.addListener(onChanged);
            return () => storage.onChanged.removeListener(onChanged);
        },
    };
}
export function memoryStorage(initial: Record<string, unknown> = {}): StorageArea {
    const data = new Map(Object.entries(structuredClone(initial)));
    const listeners = new Set<(changes: StorageChanges) => void>();
    const emit = (changes: StorageChanges) => {
        if (Object.keys(changes).length)
            for (const listener of [...listeners])
                listener(changes);
    };
    return {
        async get(keys) {
            const entries = keys === null ? [...data] : keys.flatMap((key) => (data.has(key) ? [[key, data.get(key)] as const] : []));
            return structuredClone(Object.fromEntries(entries));
        },
        async set(items) {
            const changes: StorageChanges = {};
            for (const [key, value] of Object.entries(structuredClone(items))) {
                changes[key] = data.has(key) ? { oldValue: data.get(key), newValue: value } : { newValue: value };
                data.set(key, value);
            }
            emit(structuredClone(changes));
        },
        async remove(keys) {
            const changes: StorageChanges = {};
            for (const key of keys) {
                if (!data.has(key))
                    continue;
                changes[key] = { oldValue: data.get(key) };
                data.delete(key);
            }
            emit(structuredClone(changes));
        },
        watch(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
