import { PassThrough } from 'stream';
import { debuglog } from 'util';

export default class ServerRequestAdapter extends PassThrough {
  constructor(mpq, headers) {
    super({
      objectMode: true
    });

    this._log = debuglog('ws');
    this._connection = null;

    const [method, url] = mpq.split(' ');

    this.method = method;
    this.url = url;
    this.headers = headers;
  }

  destroy() {
    this._log('ServerRequestAdapter destroy');
    this.end();
  }

  connection(value) {
    if (value === null) {
      return this._connection;
    }

    this._connection = value;
    const request = this._connection.upgrade();

    if (request === null) {
      return this;
    }

    this._headers = Object.assign({},
      request.headers, this._headers);

    delete this._headers.accept;
    return this;
  }
}
