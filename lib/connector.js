const events = require('@scola/events');
const Connection = require('./connection');

class WsConnector extends events.EventEmitter {
  constructor(server, router, codec, options) {
    super();

    this.server = server;
    this.router = router;
    this.codec = codec;
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
    const connection = new Connection(this.router, socket,
      this.codec, this.options);

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

module.exports = WsConnector;
