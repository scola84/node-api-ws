import { PassThrough } from 'stream';

export default class ServerRequestAdapter extends PassThrough {
  constructor(mpq, headers) {
    super({
      objectMode: true
    });

    this._connection = null;

    const [method, url] = mpq.split(' ');

    this.method = method;
    this.url = url;
    this.headers = headers;
  }

  destroy() {
    this.end();
    this._connection = null;
  }

  connection(value) {
    if (value === null) {
      return this._connection;
    }

    this._connection = value;
    const request = this._connection.upgrade();

    if (request) {
      this._headers = Object.assign({},
        request.headers, this._headers);

      delete this._headers.accept;
    }

    return this;
  }
}
