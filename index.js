import WsConnection from './src/connection';
import WsConnector from './src/connector';
import strings from './src/i18n/strings';

function load(app) {
  if (app.i18n()) {
    app.i18n().strings(strings);
  }
}

export {
  WsConnection,
  WsConnector,
  load
};
