import { PassThrough } from 'stream';
import { debuglog } from 'util';
import { parseHeader } from '@scola/api-http';

export default class ClientResponse extends PassThrough {
  constructor() {
    super({
      objectMode: true
    });

    this._log = debuglog('ws');

    this._connection = null;
    this._request = null;

    this._status = null;
    this._headers = {};
    this._data = null;
  }

  destroy(abort = false) {
    this._log('ClientResponse destroy abort=%s', abort);

    if (abort === true) {
      this.emit('abort');
    }

    this.end();
  }

  connection(value = null) {
    if (value === null) {
      return this._connection;
    }

    this._connection = value;
    return this;
  }

  request(value = null) {
    if (value === null) {
      return this._request;
    }

    this._request = value;
    return this;
  }

  status(value = null) {
    if (value === null) {
      return this._status;
    }

    this._status = value;
    return this;
  }

  headers(value = null) {
    if (value === null) {
      return this._headers;
    }

    this._headers = value;
    return this;
  }

  header(name, parse = false) {
    const header = this._headers[name] ||
      this._headers[name.toLowerCase()];

    if (typeof header === 'undefined') {
      return parse === true ? {} : null;
    }

    return parse === true ? parseHeader(header) : header;
  }

  data(value = null) {
    if (value === null) {
      return this._data;
    }

    this._data = value;
    return this;
  }
}
