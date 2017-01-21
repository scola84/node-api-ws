import { Duplex } from 'stream';

export default class ServerRequestAdapter extends Duplex {
  constructor(mpq, headers) {
    super({
      objectMode: true
    });

    const [method, url] = mpq.split(' ');

    this.method = method;
    this.url = url;
    this.headers = headers;

    this.once('finish', () => {
      this.push(null);
    });
  }

  connection(value) {
    const request = value.upgrade();

    if (request) {
      this._headers = Object.assign({}, request.headers, this._headers);
      delete this._headers.accept;
    }

    return this;
  }

  _read() {}

  _write(data, encoding, callback) {
    this.push(data);
    callback();
  }
}
