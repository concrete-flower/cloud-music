// Only re-exports what src/ui/client.ts actually calls (parseBlob), so the
// bundle produced from this file stays as small as esbuild's tree-shaking
// can make it.
export { parseBlob } from 'music-metadata-browser';
