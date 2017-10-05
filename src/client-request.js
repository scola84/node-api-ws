import formatQuery from 'qs/lib/stringify';
import { Writable } from 'stream';
import { debuglog } from 'util';
import { Writer } from '@scola/api-http';

export default class ClientRequest extends Writable {
  constructor() {
    super({
      objectMode: true
    });

    this._log = debuglog('ws');

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
    this._log('ClientRequest destroy abort=%s', abort);
    this._tearDown(abort);
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
      return typeof this._headers[name] === 'undefined' ?
        null : this._headers[name];
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
    this._log('ClientRequest _write data=%j ended=%s',
      data, this._ended);

    if (this._ended === false) {
      this.header('Connection', 'keep-alive');
    } else if (this.header('Connection') === 'keep-alive') {
      this.header('Connection', 'close');
    }

    const headers = this._connection
      .translate(Object.assign({}, this._headers));

    data = [
      this._mpq(),
      headers,
      data
    ];

    this._setUp().write(data, encoding, callback);
  }

  _mpq() {
    const query = formatQuery(this._query, {
      allowDots: true,
      arrayFormat: 'repeat'
    });

    return this._method + ' ' +
      this._path +
      (query.length > 0 ? '?' + query : '');
  }

  _data(data) {
    this._log('ClientRequest _data data=%j', data);

    this._connection.send(data, (error) => {
      if (error instanceof Error === true) {
        this.emit('error', error);
      }
    });
  }

  _finish() {
    this._log('ClientRequest _finish');

    if (this.header('Connection') !== 'keep-alive' && this._writer) {
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
      .encoder(this._writer, this);

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
