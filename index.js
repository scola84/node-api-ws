import strings from './src/i18n/strings';

export { default as WsConnection } from './src/connection';
export { default as WsConnector } from './src/connector';

export function load(app) {
  if (app.i18n()) {
    app.i18n().strings(strings);
  }
}
