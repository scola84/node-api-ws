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

    this._writes = 0;
    this._ended = false;

    this._handleData = (d) => this._data(d);
    this._handleFinish = () => this._finish();

    this._bind();
  }

  destroy() {
    if (this._writer) {
      this._writer.end();
    }

    this._unbind();
    this._unbindEncoder();

    this.end();

    this._connection = null;
    this._writer = null;
    this._encoder = null;
  }

  connection(value = null) {
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

  _bind() {
    this.once('finish', this._handleFinish);
  }

  _unbind() {
    this.removeListener('finish', this._handleFinish);
  }

  _bindEncoder() {
    if (this._encoder) {
      this._encoder.on('data', this._handleData);
    }
  }

  _unbindEncoder() {
    if (this._encoder) {
      this._encoder.removeListener('data', this._handleData);
    }
  }

  _write(data, encoding, callback) {
    if (this._ended === false || this._writes > 1) {
      this.headers['x-more'] = 1;
    } else if (this.headers['x-more'] === 1) {
      this.headers['x-more'] = 0;
    }

    this._writes -= 1;

    data = [this.statusCode, Object.assign({}, this.headers), data];
    this._instance().write(data, encoding, callback);
  }

  _finish() {
    const more = Boolean(this.headers['x-more']);

    if (this._writer && more === false) {
      this.destroy();
      return;
    }

    this._write(null, null, () => {
      this.destroy();
    });
  }

  _instance() {
    if (this._writer) {
      return this._writer;
    }

    this._writer = new Writer();
    this._encoder = this._connection.encoder(this._writer);

    this._bindEncoder();
    return this._writer;
  }

  _data(data) {
    this._connection.send(data);
  }
}
