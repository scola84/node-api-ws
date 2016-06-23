export { default as ClientRequest } from './src/client-request';
export { default as ClientResponse } from './src/client-response';

import Connection from './src/connection';
import Connector from './src/connector';

export {
  Connection,
  Connector
};

export function connection(socket, codec, router, options) {
  return new Connection(socket, codec, router, options);
}

export function connector(server, codec, router, options) {
  return new Connector(server, codec, router, options);
}
