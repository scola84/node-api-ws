import { Writable } from 'stream';
import { debuglog } from 'util';
import { Writer } from '@scola/api-http';

export default class ServerResponseAdapter extends Writable {
  constructor() {
    super({
      objectMode: true
    });

    this._log = debuglog('ws');

    this._connection = null;
    this._writer = null;
    this._encoder = null;

    this.statusCode = 200;
    this._headers = {};

    this._writes = 0;
    this._ended = false;

    this._handleData = (d) => this._data(d);
    this._handleFinish = () => this._finish();

    this._bindThis();
  }

  destroy() {
    this._log('ServerResponseAdapter destroy');
    this._tearDown();
  }

  connection(value = null) {
    if (value === null) {
      return this._connection;
    }

    this._connection = value;
    return this;
  }

  getHeader(name) {
    return this._headers[name] || this._headers[name.toLowerCase()];
  }

  setHeader(name, value) {
    this._headers[name] = value;
  }

  removeHeader(name) {
    delete this._headers[name];
    delete this._headers[name.toLowerCase()];
  }

  _bindThis() {
    this.setMaxListeners(this.getMaxListeners() + 1);
    this.on('finish', this._handleFinish);
  }

  _unbindThis() {
    this.setMaxListeners(this.getMaxListeners() - 1);
    this.removeListener('finish', this._handleFinish);
  }

  _bindEncoder() {
    if (this._encoder) {
      this._encoder.setMaxListeners(this._encoder.getMaxListeners() + 1);
      this._encoder.on('data', this._handleData);
    }
  }

  _unbindEncoder() {
    if (this._encoder) {
      this._encoder.setMaxListeners(this._encoder.getMaxListeners() - 1);
      this._encoder.removeListener('data', this._handleData);
    }
  }

  _write(data, encoding, callback) {
    this._log('ServerResponseAdapter _write data=%j ended=%s',
      data, this._ended);

    if (this._ended === false || this._writes > 1) {
      this._headers['x-more'] = 1;
    } else if (this._headers['x-more'] === 1) {
      this._headers['x-more'] = 0;
    }

    this._writes -= 1;

    data = [
      this.statusCode,
      Object.assign({}, this._headers),
      data
    ];

    this._setUp().write(data, encoding, callback);
  }

  _data(data) {
    this._log('ServerResponseAdapter _data data=%j', data);

    this._connection.send(data, (error) => {
      if (error instanceof Error === true) {
        this.emit('error', error);
      }
    });
  }

  _finish() {
    this._log('ServerResponseAdapter _finish');

    const more = Boolean(this._headers['x-more']);

    if (more === false && this._writer) {
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

  _tearDown() {
    if (this._writer) {
      this._writer.end();
    }

    this._unbindThis();
    this._unbindEncoder();

    this.end();
  }
}
