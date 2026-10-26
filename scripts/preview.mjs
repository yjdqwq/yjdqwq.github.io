export function bundlePreviewModules(sources) {
  return sources.map(source => source.replaceAll('\r\n', '\n')
    .replace(/^import .*from '\.\/[^']+';\n/gm, '')
    .replace(/^export /gm, '')).join('\n');
}
