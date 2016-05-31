import EventEmitter from '@scola/events';
import Connection from './connection';

export default class Connector extends EventEmitter {
  constructor(server, codec, router, options) {
    super();

    this.server = server;
    this.codec = codec;
    this.router = router;
    this.options = options;
    this.connections = new Set();

    this.bindServer();
  }

  close(code, reason, callback) {
    this.unbindServer();
    this.closeConnections(code, reason);
    callback();
  }

  closeConnections(code, reason) {
    this.connections.forEach((connection) => {
      connection.close(code, reason);
      this.unbindConnection(connection);
    });

    this.connections.clear();
  }

  bindServer() {
    this.bind(this.server, 'connection', this.handleConnection);
    this.bind(this.server, 'error', this.handleError);
  }

  unbindServer() {
    this.unbind(this.server, 'connection', this.handleConnection);
    this.unbind(this.server, 'error', this.handleError);
  }

  handleConnection(socket) {
    const connection = new Connection(socket, this.codec,
      this.router, this.options);

    this.connections.add(connection);
    this.bindConnection(connection);
    this.emit('connection', connection);
  }

  bindConnection(connection) {
    this.bind(connection, 'close', this.handleClose);
    this.bind(connection, 'error', this.handleError);
  }

  unbindConnection(connection) {
    this.unbind(connection, 'close', this.handleClose);
    this.unbind(connection, 'error', this.handleError);
  }

  handleClose(event, connection) {
    this.connections.delete(connection);
    this.unbindConnection(connection);
    this.emit('close', event, connection);
  }

  handleError(error) {
    this.emit('error', error);
  }
}
