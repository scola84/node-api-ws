const stream = require('stream');

class ServerRequestAdapter extends stream.Readable {
  constructor(socket, requestLine, headers, body) {
    super({
      objectMode: true
    });

    const [method, url] = requestLine.split(' ');

    this.method = method;
    this.url = url;
    this.headers = headers;
    this.body = body;

    this.connection = {
      remoteAddress: socket.upgradeReq.connection.remoteAddress,
      remotePort: socket.upgradeReq.connection.remotePort
    };
  }

  _read() {
    this.push(this.body);
    this.body = null;
  }
}

module.exports = ServerRequestAdapter;
