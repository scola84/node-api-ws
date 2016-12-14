import formatQuery from 'qs/lib/stringify';
import { ScolaError } from '@scola/core';
import { EventEmitter } from 'events';

export default class ClientRequest extends EventEmitter {
  constructor() {
    super();

    this._connection = null;
    this._method = 'GET';
    this._path = '/';
    this._query = {};
    this._headers = {};
  }

  connection(value) {
    if (typeof value === 'undefined') {
      return this._connection;
    }

    this._connection = value;
    return this;
  }

  method(value) {
    if (typeof value === 'undefined') {
      return this._method;
    }

    this._method = value;
    return this;
  }

  path(value) {
    if (typeof value === 'undefined') {
      return this._path;
    }

    this._path = value;
    return this;
  }

  query(value) {
    if (typeof value === 'undefined') {
      return this._query;
    }

    this._query = value;
    return this;
  }

  header(name, value) {
    if (typeof value === 'undefined') {
      return this._headers[name];
    }

    if (value === false) {
      delete this._headers[name];
      return this;
    }

    this._headers[name] = value;
    return this;
  }

  end(data, callback) {
    const Encoder = this._connection.codec().Encoder;
    const encoder = new Encoder();
    const socket = this._connection.socket();

    if (!socket) {
      this.emit('error', new ScolaError('500 invalid_socket'));
      return this;
    }

    encoder.once('error', (error) => {
      encoder.removeAllListeners();
      this.emit('error', error);
    });

    encoder.once('data', (encodedData) => {
      encoder.removeAllListeners();

      if (socket.readyState !== socket.OPEN) {
        this.emit('error', new ScolaError('500 invalid_socket'));
        return;
      }

      socket.send(encodedData);
    });

    if (callback) {
      this._callback = callback;
      this._connection.request(this);
    }

    encoder.end([this._mpq(), this._headers, data]);
    return this;
  }

  handleResponse(response) {
    this._callback(response);
  }

  _mpq() {
    const query = formatQuery(this._query);
    return this._method + ' ' + this._path + (query ? '?' + query : '');
  }
}
