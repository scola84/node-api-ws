import { EventEmitter } from 'events';
import { debuglog } from 'util';
import WsConnection from './connection';

export default class WsConnector extends EventEmitter {
  constructor() {
    super();

    this._log = debuglog('ws');

    this._server = null;
    this._router = null;
    this._codec = null;
    this._ping = null;

    this._connections = new Set();

    this._handleConnection = (s, u) => this._connection(s, u);
    this._handleClose = (e) => this._close(e);
    this._handleError = (e) => this._error(e);
  }

  close(code, reason) {
    this._log('Connector close code=%s reason=%s', code, reason);
    this._unbindServer();
    this._closeConnections(code, reason);
  }

  server(value = null) {
    if (value === null) {
      return this._server;
    }

    this._server = value;
    this._bindServer();

    return this;
  }

  router(value = null) {
    if (value === null) {
      return this._router;
    }

    this._router = value;
    return this;
  }

  codec(value = null) {
    if (value === null) {
      return this._codec;
    }

    this._codec = value;
    return this;
  }

  ping(value = null) {
    if (value === null) {
      return this._ping;
    }

    this._ping = value;
    return this;
  }

  _bindServer() {
    if (this._server) {
      this._server.addListener('connection', this._handleConnection);
      this._server.addListener('error', this._handleError);
    }
  }

  _unbindServer() {
    if (this._server) {
      this._server.removeListener('connection', this._handleConnection);
      this._server.removeListener('error', this._handleError);
    }
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

  _connection(socket, upgrade = null) {
    if (typeof socket.removeEventListener !== 'function') {
      socket.removeEventListener = socket.removeListener;
    }

    const connection = new WsConnection()
      .socket(socket)
      .upgrade(upgrade)
      .router(this._router)
      .codec(this._codec);

    if (this._ping) {
      connection.ping(this._ping);
    }

    this._connections.add(connection);
    this._bindConnection(connection);

    this._log('Connector _connection #con=%d',
      this._connections.size);

    this.emit('connection', connection);
  }

  _close(event) {
    this._connections.delete(event.connection);
    this._unbindConnection(event.connection);

    this._log('Connector _close #con=%d',
      this._connections.size);

    this.emit('close', event);
  }

  _error(event) {
    this.emit('error', event);
  }
}
