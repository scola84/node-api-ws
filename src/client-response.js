import { PassThrough } from 'stream';
import { parseHeader } from '@scola/api-http';

export default class ClientResponse extends PassThrough {
  constructor() {
    super({
      objectMode: true
    });

    this._connection = null;
    this._request = null;

    this._status = null;
    this._headers = {};
    this._data = null;
  }

  destroy(abort = false) {
    if (abort === true) {
      this.emit('abort');
    }

    this.end();

    this._connection = null;
    this._request = null;
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

    if (!this._status) {
      this._request.emit('response', this);
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

    return header && parse ? parseHeader(header) : header;
  }

  data(value = null) {
    if (value === null) {
      return this._data;
    }

    this._data = value;
    return this;
  }
}
