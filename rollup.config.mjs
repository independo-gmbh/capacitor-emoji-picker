import { nodeResolve } from '@rollup/plugin-node-resolve';

/**
 * The installed `@rollup/plugin-json` (6.1.0) always emits JSON as a JS object/array literal —
 * it has no `stringify` option in this version, despite that being documented for some other
 * json-loader tooling. For the ~432KB bundled emoji dataset, an object literal is meaningfully
 * slower to parse than `JSON.parse('...')`, so this minimal in-repo plugin emits the latter.
 */
function jsonAsParse() {
  return {
    name: 'json-as-parse',
    transform(code, id) {
      if (!id.endsWith('.json')) {
        return null;
      }
      const parsed = JSON.parse(code);
      return {
        code: `export default JSON.parse(${JSON.stringify(JSON.stringify(parsed))});`,
        map: { mappings: '' },
      };
    },
  };
}

export default {
  input: 'dist/esm/index.js',
  output: [
    {
      file: 'dist/plugin.js',
      format: 'iife',
      name: 'capacitorEmojiPicker',
      globals: {
        '@capacitor/core': 'capacitorExports',
      },
      sourcemap: true,
      inlineDynamicImports: true,
    },
    {
      file: 'dist/plugin.cjs.js',
      format: 'cjs',
      sourcemap: true,
      inlineDynamicImports: true,
    },
  ],
  external: ['@capacitor/core'],
  plugins: [nodeResolve(), jsonAsParse()],
};
