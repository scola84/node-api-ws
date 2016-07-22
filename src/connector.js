import EventEmitter from 'events';
import Connection from './connection';

export default class Connector extends EventEmitter {
  constructor(server, codec, router, options) {
    super();

    this._server = server;
    this._codec = codec;
    this._router = router;
    this._options = options;

    this._connections = new Set();

    this._handleConnection = (s) => this._connection(s);
    this._handleClose = (e, c) => this._close(e, c);
    this._handleError = (e) => this._error(e);

    this._bindServer();
  }

  close(code, reason, callback) {
    this._unbindServer();
    this._closeConnections(code, reason);

    if (callback) {
      callback();
    }
  }

  _bindServer() {
    this._server.addListener('connection', this._handleConnection);
    this._server.addListener('error', this._handleError);
  }

  _unbindServer() {
    this._server.removeListener('connection', this._handleConnection);
    this._server.removeListener('error', this._handleError);
  }

  _closeConnections(code, reason) {
    this._connections.forEach((connection) => {
      connection.close(code, reason);
      this._unbindConnection(connection);
    });

    this._connections.clear();
  }

  _bindConnection(connection) {
    connection.addListener('close', this._handleClose);
    connection.addListener('error', this._handleError);
  }

  _unbindConnection(connection) {
    connection.removeListener('close', this._handleClose);
    connection.removeListener('error', this._handleError);
  }

  _connection(socket) {
    const connection = new Connection(socket, this._codec,
      this._router, this._options);

    this._connections.add(connection);
    this._bindConnection(connection);

    this.emit('connection', connection);
  }

  _close(event, connection) {
    this._connections.delete(connection);
    this._unbindConnection(connection);

    this.emit('close', event, connection);
  }

  _error(error) {
    this.emit('error', error);
  }
}
