import { Readable } from 'stream';

export default class ClientResponse extends Readable {
  constructor(connection, statusCode, headers, body) {
    super({
      objectMode: true
    });

    this.connection = connection;
    this.statusCode = Number(statusCode);
    this.headers = headers;
    this.body = body;
  }

  getHeader(name) {
    return this.headers[name] || this.headers[name.toLowerCase()];
  }

  _read() {
    this.push(this.body);
    this.body = null;
  }
}
