import type { RqbitFile } from './rqbit.ts';
import { fileName, mediaFiles, stripExtension } from './media.ts';
export type FileGroupKind = 'series' | 'folder' | 'single';
export interface FileGroup {
    kind: FileGroupKind;
    dir: string;
    name: string;
    files: GroupedFile[];
}
export interface GroupedFile {
    index: number;
    label: string;
}
interface Entry {
    index: number;
    name: string;
}
export function groupFiles(files: RqbitFile[]): FileGroup[] {
    const folders = new Map<string, Entry[]>();
    for (const index of mediaFiles(files)) {
        const file = files[index]!;
        const dir = file.components.slice(0, -1).join('/');
        const entries = folders.get(dir) ?? [];
        entries.push({ index, name: fileName(file) });
        folders.set(dir, entries);
    }
    return [...folders]
        .sort(([a], [b]) => naturalCompare(a, b))
        .flatMap(([dir, entries]) => groupFolder(dir, entries.sort(byName)));
}
function byName(a: Entry, b: Entry): number {
    return naturalCompare(stripExtension(a.name), stripExtension(b.name)) || naturalCompare(a.name, b.name);
}
export function naturalCompare(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
function groupFolder(dir: string, entries: Entry[]): FileGroup[] {
    const placed: {
        first: Entry;
        group: FileGroup;
    }[] = [];
    const rest: Entry[] = [];
    for (const run of seriesRuns(entries)) {
        const series = run.length > 1 ? seriesOf(run.map((entry) => entry.name)) : null;
        if (series) {
            const files = run.map((entry, i) => ({ index: entry.index, label: series.labels[i]!, value: series.values[i]! }));
            files.sort((a, b) => a.value - b.value);
            placed.push({
                first: run[0]!,
                group: { kind: 'series', dir, name: series.name, files: files.map(({ index, label }) => ({ index, label })) },
            });
        }
        else {
            rest.push(...run);
        }
    }
    if (dir && rest.length > 1) {
        const files = rest.map((entry) => ({ index: entry.index, label: stripExtension(entry.name) }));
        placed.push({ first: rest[0]!, group: { kind: 'folder', dir, name: dir, files } });
    }
    else {
        for (const entry of rest) {
            placed.push({ first: entry, group: { kind: 'single', dir, name: '', files: [{ index: entry.index, label: entry.name }] } });
        }
    }
    return placed.sort((a, b) => byName(a.first, b.first)).map(({ group }) => group);
}
function seriesRuns(entries: Entry[]): Entry[][] {
    const runs: Entry[][] = [];
    let run: Entry[] = [];
    for (const entry of entries) {
        if (run.length && seriesOf([...run, entry].map((e) => e.name))) {
            run.push(entry);
        }
        else {
            if (run.length)
                runs.push(run);
            run = [entry];
        }
    }
    if (run.length)
        runs.push(run);
    return runs;
}
interface Series {
    name: string;
    labels: string[];
    values: number[];
}
function seriesOf(names: string[]): Series | null {
    const stems = names.map(stripExtension);
    const { prefix, suffix } = sharedParts(stems);
    const first = stems[0]!;
    const start = trimSeparators(first.slice(0, prefix));
    const end = trimSeparators(first.slice(first.length - suffix));
    if (!start && !end)
        return null;
    const labels = stems.map((stem) => trimSeparators(stem.slice(prefix, stem.length - suffix)));
    const values = labels.every((label) => /^\d+$/.test(label))
        ? labels.map(Number)
        : labels.every(isRoman)
            ? labels.map(romanValue)
            : null;
    if (!values)
        return null;
    const name = start && end ? `${start} … ${end}` : start ? `${start} …` : `… ${end}`;
    return { name, labels, values };
}
function sharedParts(stems: string[]): {
    prefix: number;
    suffix: number;
} {
    const first = stems[0]!;
    const shortest = Math.min(...stems.map((stem) => stem.length));
    const fromEnd = (stem: string, i: number) => stem[stem.length - 1 - i];
    let prefix = 0;
    while (prefix < shortest && stems.every((stem) => stem[prefix] === first[prefix]))
        prefix++;
    while (prefix > 0 && stems.some((stem) => joined(stem[prefix - 1], stem[prefix])))
        prefix--;
    let suffix = 0;
    while (prefix + suffix < shortest && stems.every((stem) => fromEnd(stem, suffix) === fromEnd(first, suffix)))
        suffix++;
    while (suffix > 0 && stems.some((stem) => joined(fromEnd(stem, suffix), fromEnd(stem, suffix - 1))))
        suffix--;
    return { prefix, suffix };
}
const LETTER = /\p{L}/u;
const DIGIT = /\p{N}/u;
function joined(a: string | undefined, b: string | undefined): boolean {
    if (a === undefined || b === undefined)
        return false;
    if (LETTER.test(b))
        return LETTER.test(a) || DIGIT.test(a);
    return DIGIT.test(a) && DIGIT.test(b);
}
function trimSeparators(text: string): string {
    return text.replace(/^[\s._–—-]+|[\s._–—-]+$/g, '');
}
const ROMAN = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const ROMAN_DIGITS: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
function isRoman(label: string): boolean {
    return label !== '' && ROMAN.test(label);
}
function romanValue(label: string): number {
    let value = 0;
    for (let i = 0; i < label.length; i++) {
        const digit = ROMAN_DIGITS[label[i]!]!;
        const next = ROMAN_DIGITS[label[i + 1] ?? ''] ?? 0;
        value += digit < next ? -digit : digit;
    }
    return value;
}
