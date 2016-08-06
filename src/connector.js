import EventEmitter from 'events';
import Connection from './connection';

export default class Connector extends EventEmitter {
  constructor() {
    super();

    this._server = null;
    this._codec = null;
    this._router = null;
    this._options = null;

    this._connections = new Set();

    this._handleConnection = (s) => this._connection(s);
    this._handleClose = (e, c) => this._close(e, c);
    this._handleError = (e) => this._error(e);
  }

  close(code, reason) {
    this._unbindServer();
    this._closeConnections(code, reason);
    this._server.close();
  }

  server(server) {
    this._server = server;
    this._bindServer();

    return this;
  }

  router(router) {
    this._router = router;
    return this;
  }

  codec(codec) {
    this._codec = codec;
    return this;
  }

  options(options) {
    this._options = options;
    return this;
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
    const connection = new Connection()
      .socket(socket)
      .router(this._router)
      .codec(this._codec)
      .options(this._options);

    this._connections.add(connection);
    this._bindConnection(connection);

    this.emit('connection', connection);
  }

  _close(event, connection) {
    this._connections.delete(connection);
    this._unbindConnection(connection);

    this.emit('close', event, connection);
  }

  _error(event, connection) {
    this.emit('error', event, connection);
  }
}
