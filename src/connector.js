import { EventEmitter } from '@scola/events';
import WsConnection from './connection';

export default class WsConnector extends EventEmitter {
  constructor() {
    super();

    this._server = null;
    this._codec = null;
    this._router = null;
    this._header = null;
    this._ping = null;

    this._connections = new Set();

    this._handleConnection = (s) => this._connection(s);
    this._handleClose = (e) => this._close(e);
    this._handleError = (e) => this._error(e);
  }

  close(code, reason) {
    this._unbindServer();
    this._closeConnections(code, reason);
  }

  server(value) {
    this._server = value;
    this._bindServer();

    return this;
  }

  router(value) {
    this._router = value;
    return this;
  }

  codec(value) {
    this._codec = value;
    return this;
  }

  header(value) {
    this._header = value;
    return this;
  }

  ping(value) {
    this._ping = value;
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
    const connection = new WsConnection()
      .socket(socket)
      .router(this._router)
      .codec(this._codec);

    if (this._header) {
      connection.header(this._header);
    }

    if (this._ping) {
      connection.ping(this._ping);
    }

    this._connections.add(connection);
    this._bindConnection(connection);

    this.emit('connection', connection);
  }

  _close(event) {
    this._connections.delete(event.connection);
    this._unbindConnection(event.connection);

    this.emit('close', event);
  }

  _error(event) {
    this.emit('error', event);
  }
}
