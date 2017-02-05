import { Writable } from 'stream';
import formatQuery from 'qs/lib/stringify';
import { Writer } from '@scola/api-http';

export default class ClientRequest extends Writable {
  constructor() {
    super({
      objectMode: true
    });

    this._connection = null;
    this._response = null;
    this._writer = null;
    this._encoder = null;

    this._method = 'GET';
    this._path = '/';
    this._query = {};
    this._headers = {};

    this._ended = false;

    this._handleData = (d) => this._data(d);
    this._handleFinish = () => this._finish();

    this._bindThis();
  }

  destroy(abort) {
    this._tearDown(abort);

    this._connection = null;
    this._response = null;
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

  method(value = null) {
    if (value === null) {
      return this._method;
    }

    this._method = value;
    return this;
  }

  path(value = null) {
    if (value === null) {
      return this._path;
    }

    this._path = value;
    return this;
  }

  query(value = null) {
    if (value === null) {
      return this._query;
    }

    this._query = value;
    return this;
  }

  header(name, value = null) {
    if (value === null) {
      return this._headers[name];
    }

    if (value === false) {
      delete this._headers[name];
      return this;
    }

    this._headers[name] = value;
    return this;
  }

  response(value = null) {
    if (value === null) {
      return this._response;
    }

    if (this._response) {
      return this;
    }

    this._response = value;
    this.emit('response', value);

    return this;
  }

  end(data, encoding, callback) {
    this._ended = true;
    super.end(data, encoding, callback);
  }

  _bindThis() {
    this.once('finish', this._handleFinish);
  }

  _unbindThis() {
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
    if (this._ended === false) {
      this._headers['x-more'] = 1;
    } else if (this._headers['x-more'] === 1) {
      this._headers['x-more'] = 0;
    }

    data = [
      this._mpq(),
      Object.assign({}, this._headers),
      data
    ];

    this._setUp().write(data, encoding, callback);
  }

  _mpq() {
    const query = formatQuery(this._query);

    return this._method + ' ' +
      this._path +
      (query ? '?' + query : '');
  }

  _data(data) {
    this._connection.send(data);
  }

  _finish() {
    const more = Boolean(this._headers['x-more']);

    if (this._writer && more === false) {
      this._tearDown();
      return;
    }

    this._write(null, null, () => {
      this._tearDown();
    });
  }

  _setUp() {
    if (this._writer) {
      return this._writer;
    }

    this._writer = new Writer();
    this._encoder = this._connection
      .encoder(this._writer);

    this._bindEncoder();
    return this._writer;
  }

  _tearDown(abort = false) {
    if (this._writer) {
      this._writer.end();
    }

    this._unbindThis();
    this._unbindEncoder();

    if (abort === true) {
      this.emit('abort');
    }

    this.end();
  }
}
