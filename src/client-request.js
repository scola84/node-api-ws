import { Writable } from 'stream';
import formatQuery from 'qs/lib/stringify';
import { Writer } from '@scola/api-http';
import ClientResponse from './client-response';

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

    this.once('finish', () => {
      this._write(null);
      this._writer.end();
    });
  }

  destroy(error) {
    if (this._writer) {
      this._encoder.removeAllListeners();
      this._writer.end();
    }

    if (this._response) {
      this._response.destroy(error);
    }

    if (error) {
      this.emit('error', error);
    }
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

  handleResponse(status, headers, body) {
    if (!this._response) {
      this._response = new ClientResponse()
        .connection(this)
        .status(status)
        .headers(headers);

      this.emit('response', this._response);
    }

    if (body === null) {
      this._response.end();
      return;
    }

    this._response.write(body);
  }

  _write(data, encoding, callback) {
    data = [this._mpq(), this._headers, data];
    this._instance().write(data, encoding, callback);
  }

  _mpq() {
    const query = formatQuery(this._query);
    return this._method + ' ' + this._path + (query ? '?' + query : '');
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
