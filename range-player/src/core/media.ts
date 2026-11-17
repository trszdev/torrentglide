import type { RqbitFile } from './rqbit.ts';
export type MediaKind = 'video' | 'audio' | 'subtitle' | 'other';
export type SubtitleFormat = 'srt' | 'vtt' | 'ttml';
const VIDEO = new Set('3gp avi divx f4v flv m2ts m4v mkv mov mp4 mpeg mpg mts ogv ts vob webm wmv'.split(' '));
const AUDIO = new Set('aac ac3 flac m4a mka mp3 oga ogg opus wav wma'.split(' '));
const SUBTITLES: Record<string, SubtitleFormat> = { srt: 'srt', vtt: 'vtt', ttml: 'ttml', dfxp: 'ttml' };
export function fileExtension(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}
export function stripExtension(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
}
export function mediaKind(name: string): MediaKind {
    const ext = fileExtension(name);
    if (VIDEO.has(ext))
        return 'video';
    if (AUDIO.has(ext))
        return 'audio';
    if (ext in SUBTITLES)
        return 'subtitle';
    return 'other';
}
function kindOf(file: RqbitFile): MediaKind {
    return file.attributes.padding ? 'other' : mediaKind(file.name);
}
export function isPlayable(file: RqbitFile): boolean {
    const kind = kindOf(file);
    return kind === 'video' || kind === 'audio';
}
export function filePath(file: RqbitFile): string {
    return file.components.length ? file.components.join('/') : file.name;
}
export function fileName(file: RqbitFile): string {
    return file.components.at(-1) ?? file.name.split('/').at(-1) ?? file.name;
}
export function mediaFiles(files: RqbitFile[]): number[] {
    const indices = (kind: MediaKind) => files.flatMap((file, i) => (kindOf(file) === kind ? [i] : []));
    const videos = indices('video');
    return videos.length ? videos : indices('audio');
}
export function pickDefaultFile(files: RqbitFile[]): number | null {
    const playable = files.flatMap((file, i) => (isPlayable(file) ? [i] : []));
    if (playable.length === 1)
        return playable[0] ?? null;
    const videos = playable.filter((i) => kindOf(files[i]!) === 'video');
    let total = 0;
    let largest: number | null = null;
    for (const i of videos) {
        const length = files[i]!.length;
        total += length;
        if (largest === null || length > files[largest]!.length)
            largest = i;
    }
    return largest !== null && files[largest]!.length > total / 2 ? largest : null;
}
export interface SubtitleCandidate {
    index: number;
    format: SubtitleFormat;
    label: string;
    lang: string;
}
export function matchSubtitles(files: RqbitFile[], videoIndex: number): SubtitleCandidate[] {
    const video = files[videoIndex];
    if (!video)
        return [];
    const videoBase = stripExtension(fileName(video)).toLowerCase();
    const subtitles = files.flatMap((file, index) => (kindOf(file) === 'subtitle' ? [{ file, index }] : []));
    const byName = subtitles.filter(({ file }) => fileName(file).toLowerCase().startsWith(videoBase));
    const byFolder = subtitles.filter(({ file }) => file.components.slice(0, -1).some((dir) => dir.toLowerCase() === videoBase));
    const onlyVideo = files.filter((file) => kindOf(file) === 'video').length === 1;
    const matched = byName.length ? byName : byFolder.length ? byFolder : onlyVideo ? subtitles : [];
    return matched.map(({ file, index }) => {
        const base = stripExtension(fileName(file));
        const rest = base.toLowerCase().startsWith(videoBase) ? base.slice(videoBase.length) : base;
        const label = rest.replace(/^[\s._-]+/, '').replace(/^\d+[_\s.-]+/, '').replace(/[._]+/g, ' ').trim() || base;
        const lang = guessLanguage(label);
        const onlyLanguage = LANGUAGE_WORDS.get(label.toLowerCase()) !== undefined;
        return { index, format: SUBTITLES[fileExtension(file.name)]!, label: onlyLanguage ? englishName(lang) : label, lang };
    });
}
const LANGUAGE_WORDS = new Map<string, string>();
for (const [code, ...words] of [
    ['ar', 'ara', 'arabic'], ['cs', 'cze', 'ces', 'czech'], ['da', 'dan', 'danish'], ['de', 'ger', 'deu', 'german'],
    ['el', 'gre', 'ell', 'greek'], ['en', 'eng', 'english'], ['es', 'spa', 'spanish'], ['fi', 'fin', 'finnish'],
    ['fr', 'fre', 'fra', 'french'], ['he', 'heb', 'hebrew'], ['hi', 'hin', 'hindi'], ['hu', 'hun', 'hungarian'],
    ['id', 'ind', 'indonesian'], ['it', 'ita', 'italian'], ['ja', 'jpn', 'japanese'], ['ko', 'kor', 'korean'],
    ['nl', 'dut', 'nld', 'dutch'], ['no', 'nor', 'norwegian'], ['pl', 'pol', 'polish'], ['pt', 'por', 'portuguese'],
    ['ro', 'rum', 'ron', 'romanian'], ['ru', 'rus', 'russian'], ['sv', 'swe', 'swedish'], ['th', 'tha', 'thai'],
    ['tr', 'tur', 'turkish'], ['uk', 'ukr', 'ukrainian'], ['vi', 'vie', 'vietnamese'], ['zh', 'chi', 'zho', 'chinese'],
] as const) {
    LANGUAGE_WORDS.set(code, code);
    for (const word of words)
        LANGUAGE_WORDS.set(word, code);
}
function guessLanguage(label: string): string {
    for (const word of label.toLowerCase().split(/[\s._()[\]-]+/).reverse()) {
        const code = LANGUAGE_WORDS.get(word);
        if (code)
            return code;
    }
    return '';
}
function englishName(code: string): string {
    try {
        return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
    }
    catch {
        return code;
    }
}
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0)
        return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
