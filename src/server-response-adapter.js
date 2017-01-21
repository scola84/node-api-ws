import { Writable } from 'stream';
import { Writer } from '@scola/api-http';

export default class ServerResponseAdapter extends Writable {
  constructor() {
    super({
      objectMode: true
    });

    this._connection = null;
    this._writer = null;
    this._encoder = null;

    this.statusCode = 200;
    this.headers = {};

    this.once('finish', () => {
      this._write(null);
      this._writer.end();
    });
  }

  connection(value) {
    if (value === null) {
      return this._connection;
    }

    this._connection = value;
    return this;
  }

  getHeader(name) {
    return this.headers[name] || this.headers[name.toLowerCase()];
  }

  setHeader(name, value) {
    this.headers[name] = value;
  }

  removeHeader(name) {
    delete this.headers[name];
    delete this.headers[name.toLowerCase()];
  }

  _write(data, encoding, callback) {
    data = [this.statusCode, this.headers, data];
    this._instance().write(data, encoding, callback);
  }

  _instance() {
    if (this._writer) {
      return this._writer;
    }

    this._writer = new Writer();
    this._encoder = this._connection.encoder(this._writer);

    this._encoder.on('data', (data) => {
      this._connection.send(data);
    });

    return this._writer;
  }
}
