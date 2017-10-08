import { PassThrough } from 'stream';
import { debuglog } from 'util';

export default class ServerRequestAdapter extends PassThrough {
  constructor(mpq, headers) {
    super({
      objectMode: true
    });

    this._log = debuglog('ws');
    this._connection = null;
    this._request = null;

    const [method, url] = mpq.split(' ');

    this.method = method;
    this.url = url;
    this.headers = headers;
  }

  destroy() {
    this._destroy(null, () => {});
  }

  _destroy(error, callback) {
    this.push(null);
    this.end();
    callback(error);
  }

  connection(value) {
    if (value === null) {
      return this._connection;
    }

    this._connection = value;

    this.headers = Object.assign({},
      this._connection.headers(),
      this.headers);

    return this;
  }

  request(value = null) {
    if (value === null) {
      return this._request;
    }

    this._request = value;
    this._request.request(this);

    return this;
  }
}
