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

    this.headers = Object.assign({},
      this._connection.headers(),
      this.headers);

    delete this.headers.accept;
    return this;
  }
}
