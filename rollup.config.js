import buble from 'rollup-plugin-buble';

export default {
  dest: './dist/api-ws.js',
  entry: 'index.js',
  format: 'cjs',
  external: [
    '@scola/api-http',
    '@scola/error',
    'events',
    'querystring',
    'stream',
    'url'
  ],
  plugins: [
    buble()
  ]
};
