import EventEmitter from '@scola/events';
import Connection from './connection';

export default class Connector extends EventEmitter {
  constructor(server, codec, router, options) {
    super();

    this._server = server;
    this._codec = codec;
    this._router = router;
    this._options = options;
    this._connections = new Set();

    this._bindServer();
  }

  close(code, reason, callback) {
    this._unbindServer();
    this._closeConnections(code, reason);

    if (callback) {
      callback();
    }
  }

  closeConnections(code, reason) {
    this._connections.forEach((connection) => {
      connection.close(code, reason);
      this._unbindConnection(connection);
    });

    this._connections.clear();
  }

  _bindServer() {
    this.bind(this._server, 'connection', this._handleConnection);
    this.bind(this._server, 'error', this._handleError);
  }

  _unbindServer() {
    this.unbind(this._server, 'connection', this._handleConnection);
    this.unbind(this._server, 'error', this._handleError);
  }

  _handleConnection(socket) {
    const connection = new Connection(socket, this._codec,
      this._router, this._options);

    this._connections.add(connection);
    this._bindConnection(connection);
    this.emit('connection', connection);
  }

  _bindConnection(connection) {
    this.bind(connection, 'close', this._handleClose);
    this.bind(connection, 'error', this._handleError);
  }

  _unbindConnection(connection) {
    this.unbind(connection, 'close', this._handleClose);
    this.unbind(connection, 'error', this._handleError);
  }

  _handleClose(event, connection) {
    this._connections.delete(connection);
    this._unbindConnection(connection);
    this.emit('close', event, connection);
  }

  _handleError(error) {
    this.emit('error', error);
  }
}
