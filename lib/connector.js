const events = require('events');
const Connection = require('./connection');

class Connector extends events.EventEmitter {
  constructor(server, router, codec) {
    super();

    this.server = server;
    this.router = router;
    this.codec = codec;

    this.connections = new Set();

    this.server.on('connection', this.handleConnection.bind(this));
    this.server.on('error', this.handleError.bind(this));
  }

  handleConnection(socket) {
    socket.url = socket.upgradeReq.connection.remoteAddress +
      socket.upgradeReq.connection.remotePort;

    const connection = new Connection(this.router, socket, this.codec, this);

    this.connections.add(connection);
    this.emit('connection', connection);
  }

  handleError(error) {
    this.emit('error', error);
  }

  closeConnection(connection) {
    this.connections.delete(connection);
    this.emit('close', connection);
  }

  close() {
    this.server.close();
  }
}

module.exports = Connector;
