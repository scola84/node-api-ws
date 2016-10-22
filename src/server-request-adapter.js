import { Readable } from 'stream';

export default class ServerRequestAdapter extends Readable {
  constructor(connection, mpq, headers, body) {
    super({
      objectMode: true
    });

    const [method, url] = mpq.split(' ');
    const socket = connection.socket();

    if (socket.upgradeReq) {
      headers = Object.assign({}, socket.upgradeReq.headers, headers);
    }

    this.connection = connection;
    this.method = method;
    this.url = url;
    this.headers = headers;
    this.body = body;
  }

  _read() {
    this.push(this.body);
    this.body = null;
  }
}
