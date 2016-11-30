import { Readable } from 'stream';
import { parseHeader } from '@scola/api-http';

export default class ClientResponse extends Readable {
  constructor() {
    super({
      objectMode: true
    });

    this._connection = null;
    this._status = null;
    this._headers = {};
    this._body = null;
    this._data = null;
  }

  connection(value) {
    if (typeof value === 'undefined') {
      return this._connection;
    }

    this._connection = value;
    return this;
  }

  status(value) {
    if (typeof value === 'undefined') {
      return this._status;
    }

    this._status = value;
    return this;
  }

  headers(value) {
    this._headers = value;
    return this;
  }

  data(value = null) {
    if (value === null) {
      return this._data;
    }

    this._data = value;
    return this;
  }

  header(name, parse) {
    const header = this._headers[name] || this._headers[name.toLowerCase()];
    return header && parse ? parseHeader(header) : header;
  }

  body(value) {
    this._body = value;
    return this;
  }

  _read() {
    this.push(this._body);
    this._body = null;
  }
}
