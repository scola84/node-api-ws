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
  }

  connection(connection) {
    if (typeof connection === 'undefined') {
      return this._connection;
    }

    this._connection = connection;
    return this;
  }

  status(status) {
    if (typeof status === 'undefined') {
      return this._status;
    }

    this._status = status;
    return this;
  }

  headers(headers) {
    this._headers = headers;
    return this;
  }

  header(name, parse) {
    const header = this._headers[name] || this._headers[name.toLowerCase()];
    return header && parse ? parseHeader(header) : header;
  }

  body(body) {
    this._body = body;
    return this;
  }

  _read() {
    this.push(this._body);
    this._body = null;
  }
}
