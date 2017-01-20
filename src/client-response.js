import { Duplex } from 'stream';
import { parseHeader } from '@scola/api-http';

export default class ClientResponse extends Duplex {
  constructor() {
    super({
      objectMode: true
    });

    this._connection = null;
    this._status = null;
    this._headers = {};
    this._data = null;
  }

  connection(value = null) {
    if (value === null) {
      return this._connection;
    }

    this._connection = value;
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

    return header && parse ? parseHeader(header) : header;
  }

  data(value = null) {
    if (value === null) {
      return this._data;
    }

    this._data = value;
    return this;
  }

  _write(data, encoding, callback) {
    this.push(data);
    callback();
  }

  _read() {}
}
