import { Readable } from 'stream';

export default class ServerRequestAdapter extends Readable {
  constructor(connection, requestLine, headers, body) {
    super({
      objectMode: true
    });

    const [method, url] = requestLine.split(' ');

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
